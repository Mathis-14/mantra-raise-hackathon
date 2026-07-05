import { GoogleAuth } from "google-auth-library";
import { z } from "zod";

import { googleAdsEnv } from "@/lib/env";

const GOOGLE_ADS_API_VERSION = "v24";
const GOOGLE_ADS_API_ORIGIN = "https://googleads.googleapis.com";
const GOOGLE_ADS_SCOPE = "https://www.googleapis.com/auth/adwords";
const REQUEST_TIMEOUT_MS = 10_000;
const TEST_BUDGET_MICROS = "1000000";

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

const mutateSchema = z.object({
  results: z.array(z.object({ resourceName: resourceNameSchema })).min(1),
});

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
}

export class GoogleAdsConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoogleAdsConfigurationError";
  }
}

const auth = new GoogleAuth({ scopes: [GOOGLE_ADS_SCOPE] });

async function accessToken(): Promise<string> {
  const client = await auth.getClient();
  const response = await client.getAccessToken();
  if (!response.token) {
    throw new GoogleAdsConfigurationError("Google Ads authentication did not return an access token");
  }
  return response.token;
}

async function googleAdsRequest(path: string, init?: RequestInit): Promise<unknown> {
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
    throw new Error(`Google Ads API request failed (${response.status}): ${reason}${requestId ? ` [${requestId}]` : ""}`);
  }
  return response.json();
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

function campaignName(runId: string): string {
  return `MANTRA_TEST_${runId}`;
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
  const name = campaignName(input.runId);

  const existingPages = campaignSearchSchema.parse(await search(
    env.GOOGLE_ADS_CUSTOMER_ID,
    `SELECT campaign.id, campaign.resource_name, campaign.name, campaign.status FROM campaign WHERE campaign.name = '${name}' LIMIT 1`,
  ));
  const existing = firstResult(existingPages)?.campaign;
  if (existing) {
    if (existing.status !== "PAUSED") {
      throw new GoogleAdsConfigurationError("Existing Mantra test campaign is not paused");
    }
    return {
      campaignId: existing.id,
      resourceName: existing.resourceName,
      status: "PAUSED",
      testAccount: account.testAccount,
      created: false,
    };
  }

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
  };
}
