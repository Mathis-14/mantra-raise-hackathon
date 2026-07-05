import { GoogleAuth } from "google-auth-library";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

import { googleAdsEnv } from "@/lib/env";

const GOOGLE_ADS_API_VERSION = "v24";
const GOOGLE_ADS_API_ORIGIN = "https://googleads.googleapis.com";
const GOOGLE_ADS_SCOPE = "https://www.googleapis.com/auth/adwords";
const REQUEST_TIMEOUT_MS = 10_000;
const TEST_BUDGET_MICROS = "1000000";
const DEMO_IMAGE_PATH = path.join(process.cwd(), "frontend", "public", "google-ads-demo-gameplay1-square.png");
const MAX_DEMO_IMAGE_BYTES = 2_000_000;

const customerIdSchema = z.string().regex(/^\d{10}$/);
const resourceNameSchema = z.string().min(1);

const customerClientSchema = z.object({
  id: customerIdSchema,
  descriptiveName: z.string().min(1),
  level: z.coerce.number().int().nonnegative(),
  manager: z.boolean(),
  testAccount: z.boolean(),
  status: z.string().min(1),
});

const customerSchema = z.object({
  id: customerIdSchema,
  descriptiveName: z.string().min(1),
  testAccount: z.boolean(),
  status: z.string().min(1),
});

const customerClientSearchSchema = z.array(z.object({
  results: z.array(z.object({ customerClient: customerClientSchema })).default([]),
}));

const customerSearchSchema = z.array(z.object({
  results: z.array(z.object({ customer: customerSchema })).default([]),
}));

const campaignSearchSchema = z.array(z.object({
  results: z.array(z.object({
    campaign: z.object({
      id: z.string().min(1),
      resourceName: resourceNameSchema,
      name: z.string().min(1),
      status: z.string().min(1),
    }),
  })).default([]),
}));

const undeclaredCampaignSearchSchema = z.array(z.object({
  results: z.array(z.object({
    campaign: z.object({ id: z.string().min(1) }),
  })).default([]),
}));

const mutateSchema = z.object({
  results: z.array(z.object({ resourceName: resourceNameSchema })).min(1),
});

const assetSearchSchema = z.array(z.object({
  results: z.array(z.object({
    asset: z.object({
      id: z.string().min(1),
      resourceName: resourceNameSchema,
      name: z.string().optional().default("Mantra demo image"),
      type: z.literal("IMAGE"),
      source: z.string().min(1),
    }),
  })).default([]),
}));

const campaignAssetSearchSchema = z.array(z.object({
  results: z.array(z.object({
    campaignAsset: z.object({ resourceName: resourceNameSchema }),
  })).default([]),
}));

export const launchTestCampaignSchema = z.object({
  runId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
});

export interface VerifiedGoogleAdsAccount {
  connected: true;
  environment: "TEST";
  customerId: string;
  descriptiveName: string;
  status: string;
  testAccount: true;
  manager: false;
  canServeAds: false;
}

export interface TestCampaignResult {
  campaignId: string;
  resourceName: string;
  status: "PAUSED";
  testAccount: true;
  created: boolean;
  attempt: number;
  previousRemovedCount: number;
}

export interface ExistingTestCampaign {
  campaignId: string;
  resourceName: string;
  name: string;
  status: string;
  attempt: number;
}

export interface UploadedDemoAsset {
  assetId: string;
  resourceName: string;
  name: string;
  type: "IMAGE";
  source: string;
  testAccount: true;
  created: boolean;
  requestId: string | null;
  timestamp: string;
}

export interface LinkedDemoAsset extends UploadedDemoAsset {
  campaignId: string;
  campaignAttempt: number;
  linked: boolean;
  campaignStatus: "PAUSED";
}

export class GoogleAdsConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoogleAdsConfigurationError";
  }
}

export class GoogleAdsApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly policyCode: string | null,
    readonly requestId: string | null,
  ) {
    super(message);
    this.name = "GoogleAdsApiError";
  }
}

const auth = new GoogleAuth({ scopes: [GOOGLE_ADS_SCOPE] });

function googleAdsErrorDetails(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(googleAdsErrorDetails);
  if (typeof value !== "object" || value === null) return [];
  return Object.entries(value).flatMap(([key, entry]) => {
    if (typeof entry === "string"
      && (key === "message" || key === "fieldName" || key.endsWith("Error"))) {
      return [entry.replaceAll(/\d{10}/g, "[customer]")];
    }
    return googleAdsErrorDetails(entry);
  });
}

async function accessToken(): Promise<string> {
  const client = await auth.getClient();
  const response = await client.getAccessToken();
  if (!response.token) {
    throw new GoogleAdsConfigurationError("Google Ads authentication did not return an access token");
  }
  return response.token;
}

async function googleAdsRequestWithMetadata(
  path: string,
  init?: RequestInit,
): Promise<{ body: unknown; requestId: string | null }> {
  const env = googleAdsEnv();
  const token = await accessToken();
  const response = await fetch(`${GOOGLE_ADS_API_ORIGIN}/${GOOGLE_ADS_API_VERSION}${path}`, {
    ...init,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "developer-token": env.GOOGLE_ADS_DEVELOPER_TOKEN,
      "login-customer-id": env.GOOGLE_ADS_LOGIN_CUSTOMER_ID,
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const requestId = response.headers.get("request-id");
    const body: unknown = await response.json().catch(() => null);
    const errorBodySchema = z.object({
      error: z.object({ status: z.string().optional(), message: z.string().optional() }),
    });
    const detail = z.union([errorBodySchema, z.array(errorBodySchema).min(1)])
      .transform((value) => Array.isArray(value) ? value[0] : value)
      .safeParse(body);
    const reason = detail.success && detail.data
      ? [detail.data.error.status, detail.data.error.message]
        .filter((part): part is string => Boolean(part))
        .join(": ")
        .replaceAll(/\d{10}/g, "[customer]")
      : "request rejected";
    const nestedReason = [...new Set<string>(googleAdsErrorDetails(body))]
      .filter((value) => value !== reason)
      .slice(0, 6)
      .join(" | ");
    const errorPayload = JSON.stringify(body);
    const policyCode = reason.includes("EU_POLITICAL_ADVERTISING_DECLARATION_REQUIRED")
      || errorPayload.includes("EU_POLITICAL_ADVERTISING_DECLARATION_REQUIRED")
      ? "EU_POLITICAL_ADVERTISING_DECLARATION_REQUIRED"
      : reason.includes("MISSING_EU_POLITICAL_ADVERTISING_SELF_DECLARATION")
        || errorPayload.includes("MISSING_EU_POLITICAL_ADVERTISING_SELF_DECLARATION")
        || errorPayload.includes("containsEuPoliticalAdvertising")
        || errorPayload.includes("contains_eu_political_advertising")
        ? "MISSING_EU_POLITICAL_ADVERTISING_SELF_DECLARATION"
        : null;
    throw new GoogleAdsApiError(
      nestedReason ? `${reason} | ${nestedReason}` : reason,
      response.status,
      policyCode,
      requestId,
    );
  }
  return { body: await response.json(), requestId: response.headers.get("request-id") };
}

async function googleAdsRequest(path: string, init?: RequestInit): Promise<unknown> {
  return (await googleAdsRequestWithMetadata(path, init)).body;
}

async function search(customerId: string, query: string): Promise<unknown> {
  return googleAdsRequest(`/customers/${customerId}/googleAds:searchStream`, {
    method: "POST",
    body: JSON.stringify({ query }),
  });
}

function firstResult<T>(pages: readonly { results: readonly T[] }[]): T | undefined {
  return pages.flatMap((page) => page.results)[0];
}

export async function verifyGoogleAdsConnection(): Promise<VerifiedGoogleAdsAccount> {
  const env = googleAdsEnv();
  if (env.GOOGLE_ADS_LOGIN_CUSTOMER_ID === env.GOOGLE_ADS_CUSTOMER_ID) {
    throw new GoogleAdsConfigurationError("Google Ads manager and child customer IDs must differ");
  }

  const managerPages = customerSearchSchema.parse(await search(
    env.GOOGLE_ADS_LOGIN_CUSTOMER_ID,
    "SELECT customer.id, customer.descriptive_name, customer.test_account, customer.status FROM customer LIMIT 1",
  ));
  const manager = firstResult(managerPages)?.customer;
  if (!manager || manager.id !== env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || !manager.testAccount) {
    throw new GoogleAdsConfigurationError("Configured login customer is not a verified test manager");
  }

  const childPages = customerClientSearchSchema.parse(await search(
    env.GOOGLE_ADS_LOGIN_CUSTOMER_ID,
    `SELECT customer_client.id, customer_client.descriptive_name, customer_client.level, customer_client.manager, customer_client.test_account, customer_client.status FROM customer_client WHERE customer_client.id = ${env.GOOGLE_ADS_CUSTOMER_ID}`,
  ));
  const child = firstResult(childPages)?.customerClient;
  if (!child
    || child.id !== env.GOOGLE_ADS_CUSTOMER_ID
    || child.level !== 1
    || child.manager
    || !child.testAccount) {
    throw new GoogleAdsConfigurationError("Configured target is not a direct non-manager test child");
  }

  const directPages = customerSearchSchema.parse(await search(
    env.GOOGLE_ADS_CUSTOMER_ID,
    "SELECT customer.id, customer.descriptive_name, customer.test_account, customer.status FROM customer LIMIT 1",
  ));
  const direct = firstResult(directPages)?.customer;
  if (!direct || direct.id !== child.id || !direct.testAccount) {
    throw new GoogleAdsConfigurationError("Direct target verification did not confirm a test account");
  }

  return {
    connected: true,
    environment: "TEST",
    customerId: direct.id,
    descriptiveName: direct.descriptiveName,
    status: direct.status,
    testAccount: true,
    manager: false,
    canServeAds: false,
  };
}

/** Returns campaign IDs that still require the mandatory EU declaration. Read-only. */
export async function findUndeclaredEuPoliticalCampaignIds(): Promise<string[]> {
  await verifyGoogleAdsConnection();
  const env = googleAdsEnv();
  const pages = undeclaredCampaignSearchSchema.parse(await search(
    env.GOOGLE_ADS_CUSTOMER_ID,
    "SELECT campaign.id FROM campaign WHERE campaign.missing_eu_political_advertising_declaration = true",
  ));
  return pages.flatMap((page) => page.results.map((result) => result.campaign.id));
}

export async function readDemoImage(): Promise<Buffer> {
  const data = await readFile(DEMO_IMAGE_PATH);
  if (data.length === 0 || data.length > MAX_DEMO_IMAGE_BYTES) {
    throw new GoogleAdsConfigurationError("Demo image has an invalid size");
  }
  return data;
}

function assetIdFromResourceName(resourceName: string): string {
  const id = resourceName.split("/").at(-1);
  if (!id) throw new Error("Google Ads returned an invalid asset resource name");
  return id;
}

async function findAssetByResourceName(resourceName: string) {
  const env = googleAdsEnv();
  const pages = assetSearchSchema.parse(await search(
    env.GOOGLE_ADS_CUSTOMER_ID,
    `SELECT asset.id, asset.resource_name, asset.name, asset.type, asset.source FROM asset WHERE asset.resource_name = '${resourceName}' LIMIT 1`,
  ));
  return firstResult(pages)?.asset ?? null;
}

export async function uploadDemoImageAsset(): Promise<UploadedDemoAsset> {
  await verifyGoogleAdsConnection();
  const env = googleAdsEnv();
  const image = await readDemoImage();
  const digest = createHash("sha256").update(image).digest("hex").slice(0, 10).toUpperCase();
  const name = `MANTRA_DEMO_GAMEPLAY1_${digest}`;

  const existingPages = assetSearchSchema.parse(await search(
    env.GOOGLE_ADS_CUSTOMER_ID,
    `SELECT asset.id, asset.resource_name, asset.name, asset.type, asset.source FROM asset WHERE asset.name = '${name}' LIMIT 1`,
  ));
  const existing = firstResult(existingPages)?.asset;
  if (existing) {
    return {
      assetId: existing.id,
      resourceName: existing.resourceName,
      name: existing.name,
      type: existing.type,
      source: existing.source,
      testAccount: true,
      created: false,
      requestId: null,
      timestamp: new Date().toISOString(),
    };
  }

  const mutation = await googleAdsRequestWithMetadata(
    `/customers/${env.GOOGLE_ADS_CUSTOMER_ID}/assets:mutate`,
    {
      method: "POST",
      body: JSON.stringify({
        operations: [{
          create: {
            name,
            type: "IMAGE",
            imageAsset: { data: image.toString("base64") },
          },
        }],
      }),
    },
  );
  const response = mutateSchema.parse(mutation.body);
  const resourceName = response.results[0]?.resourceName;
  if (!resourceName) throw new Error("Google Ads did not return an image asset");
  const verified = await findAssetByResourceName(resourceName);
  if (!verified) throw new Error("Google Ads image asset could not be verified after upload");

  return {
    assetId: assetIdFromResourceName(resourceName),
    resourceName,
    name: verified.name,
    type: verified.type,
    source: verified.source,
    testAccount: true,
    created: true,
    requestId: mutation.requestId,
    timestamp: new Date().toISOString(),
  };
}

export async function uploadAndLinkDemoImageAsset(value: unknown): Promise<LinkedDemoAsset> {
  const input = launchTestCampaignSchema.parse(value);
  await verifyGoogleAdsConnection();
  const history = await campaignHistory(input.runId);
  const campaign = history
    .filter((entry) => entry.status === "PAUSED")
    .sort((left, right) => right.attempt - left.attempt)[0];
  if (!campaign) {
    throw new GoogleAdsConfigurationError("A paused Mantra test campaign is required before linking an image");
  }

  const asset = await uploadDemoImageAsset();
  const env = googleAdsEnv();
  const existingPages = campaignAssetSearchSchema.parse(await search(
    env.GOOGLE_ADS_CUSTOMER_ID,
    `SELECT campaign_asset.resource_name, campaign.id, asset.id FROM campaign_asset WHERE campaign.id = ${campaign.campaignId} AND asset.id = ${asset.assetId} AND campaign_asset.field_type = 'AD_IMAGE'`,
  ));
  const existing = firstResult(existingPages)?.campaignAsset;
  if (existing) {
    return {
      ...asset,
      campaignId: campaign.campaignId,
      campaignAttempt: campaign.attempt,
      linked: false,
      campaignStatus: "PAUSED",
    };
  }

  await googleAdsRequest(
    `/customers/${env.GOOGLE_ADS_CUSTOMER_ID}/campaignAssets:mutate`,
    {
      method: "POST",
      body: JSON.stringify({
        operations: [{
          create: {
            campaign: campaign.resourceName,
            asset: asset.resourceName,
            fieldType: "AD_IMAGE",
          },
        }],
      }),
    },
  );

  return {
    ...asset,
    campaignId: campaign.campaignId,
    campaignAttempt: campaign.attempt,
    linked: true,
    campaignStatus: "PAUSED",
  };
}

function campaignName(runId: string): string {
  return `MANTRA_TEST_${runId}`;
}

function campaignAttempt(baseName: string, name: string): number | null {
  if (name === baseName) return 1;
  const match = new RegExp(`^${baseName}_A(\\d+)$`).exec(name);
  if (!match?.[1]) return null;
  const attempt = Number.parseInt(match[1], 10);
  return Number.isSafeInteger(attempt) && attempt > 1 ? attempt : null;
}

async function campaignHistory(runId: string): Promise<ExistingTestCampaign[]> {
  const env = googleAdsEnv();
  const baseName = campaignName(runId);
  const pages = campaignSearchSchema.parse(await search(
    env.GOOGLE_ADS_CUSTOMER_ID,
    `SELECT campaign.id, campaign.resource_name, campaign.name, campaign.status FROM campaign WHERE campaign.name LIKE '${baseName}%'`,
  ));
  return pages.flatMap((page) => page.results).flatMap(({ campaign }) => {
    const attempt = campaignAttempt(baseName, campaign.name);
    return attempt === null ? [] : [{
      campaignId: campaign.id,
      resourceName: campaign.resourceName,
      name: campaign.name,
      status: campaign.status,
      attempt,
    }];
  });
}

/** Reads an existing deterministic Mantra campaign without performing a mutation. */
export async function findTestCampaign(value: unknown): Promise<ExistingTestCampaign | null> {
  const input = launchTestCampaignSchema.parse(value);
  await verifyGoogleAdsConnection();
  const history = await campaignHistory(input.runId);
  return history.sort((left, right) => right.attempt - left.attempt)[0] ?? null;
}

function campaignIdFromResourceName(resourceName: string): string {
  const id = resourceName.split("/").at(-1);
  if (!id) throw new Error("Google Ads returned an invalid campaign resource name");
  return id;
}

export async function createPausedTestCampaign(value: unknown): Promise<TestCampaignResult> {
  const input = launchTestCampaignSchema.parse(value);
  const account = await verifyGoogleAdsConnection();
  const env = googleAdsEnv();
  const history = await campaignHistory(input.runId);
  const unsafe = history.find((campaign) => campaign.status !== "PAUSED" && campaign.status !== "REMOVED");
  if (unsafe) {
    throw new GoogleAdsConfigurationError("Existing Mantra test campaign has an unsafe status");
  }
  const existing = history
    .filter((campaign) => campaign.status === "PAUSED")
    .sort((left, right) => right.attempt - left.attempt)[0];
  const previousRemovedCount = history.filter((campaign) => campaign.status === "REMOVED").length;
  if (existing) {
    return {
      campaignId: existing.campaignId,
      resourceName: existing.resourceName,
      status: "PAUSED",
      testAccount: account.testAccount,
      created: false,
      attempt: existing.attempt,
      previousRemovedCount,
    };
  }

  const attempt = history.reduce((maximum, campaign) => Math.max(maximum, campaign.attempt), 0) + 1;
  const baseName = campaignName(input.runId);
  const name = attempt === 1 ? baseName : `${baseName}_A${attempt}`;

  const budget = mutateSchema.parse(await googleAdsRequest(
    `/customers/${env.GOOGLE_ADS_CUSTOMER_ID}/campaignBudgets:mutate`,
    {
      method: "POST",
      body: JSON.stringify({
        operations: [{
          create: {
            name: `${name}_BUDGET`,
            amountMicros: TEST_BUDGET_MICROS,
            deliveryMethod: "STANDARD",
            explicitlyShared: false,
          },
        }],
      }),
    },
  ));
  const budgetResourceName = budget.results[0]?.resourceName;
  if (!budgetResourceName) throw new Error("Google Ads did not return a campaign budget");

  const campaign = mutateSchema.parse(await googleAdsRequest(
    `/customers/${env.GOOGLE_ADS_CUSTOMER_ID}/campaigns:mutate`,
    {
      method: "POST",
      body: JSON.stringify({
        operations: [{
          create: {
            name,
            status: "PAUSED",
            containsEuPoliticalAdvertising: "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING",
            advertisingChannelType: "SEARCH",
            campaignBudget: budgetResourceName,
            manualCpc: {},
            networkSettings: {
              targetGoogleSearch: true,
              targetSearchNetwork: false,
              targetContentNetwork: false,
              targetPartnerSearchNetwork: false,
            },
          },
        }],
      }),
    },
  ));
  const resourceName = campaign.results[0]?.resourceName;
  if (!resourceName) throw new Error("Google Ads did not return a campaign");

  return {
    campaignId: campaignIdFromResourceName(resourceName),
    resourceName,
    status: "PAUSED",
    testAccount: true,
    created: true,
    attempt,
    previousRemovedCount,
  };
}
