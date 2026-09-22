import "server-only";

function readRequired(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function readOptional(name: string, fallback: string): string {
  return process.env[name] || fallback;
}

function readPositiveInteger(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] || String(fallback), 10);

  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return value;
}

export const config = {
  get aiGatewayApiKey() {
    return readRequired("AI_GATEWAY_API_KEY");
  },
  get aiModel() {
    return readOptional("AI_MODEL", "openai/gpt-5.6-luna");
  },
  get publicAppUrl() {
    return readRequired("PUBLIC_APP_URL");
  },
  get metaVerifyToken() {
    return readRequired("META_VERIFY_TOKEN");
  },
  get metaAppSecret() {
    return readRequired("META_APP_SECRET");
  },
  get metaAccessToken() {
    return readRequired("META_ACCESS_TOKEN");
  },
  get metaGraphVersion() {
    return readOptional("META_GRAPH_VERSION", "v26.0");
  },
  get metaSpecialAdCategory() {
    return readOptional("META_SPECIAL_AD_CATEGORY", "HOUSING");
  },
  get metaAdAccountId() {
    return readRequired("META_AD_ACCOUNT_ID");
  },
  get metaPageId() {
    return readRequired("META_PAGE_ID");
  },
  get whatsappPhoneNumberId() {
    return readRequired("WHATSAPP_PHONE_NUMBER_ID");
  },
  get whatsappBusinessPhoneNumber() {
    return readRequired("WHATSAPP_BUSINESS_PHONE_NUMBER");
  },
  get supabaseUrl() {
    return readRequired("NEXT_PUBLIC_SUPABASE_URL");
  },
  get supabaseSecretKey() {
    return readRequired("SUPABASE_SECRET_KEY");
  },
  get approvalHmacSecret() {
    return readRequired("APPROVAL_HMAC_SECRET");
  },
  get defaultDailyBudgetMinor() {
    return readPositiveInteger("DEFAULT_DAILY_BUDGET_MINOR", 100_000);
  },
  get maximumDailyBudgetMinor() {
    return readPositiveInteger("MAX_DAILY_BUDGET_MINOR", 500_000);
  },
  get maximumTotalBudgetMinor() {
    return readPositiveInteger("MAX_TOTAL_BUDGET_MINOR", 3_500_000);
  },
  get defaultCampaignDays() {
    return readPositiveInteger("DEFAULT_CAMPAIGN_DAYS", 7);
  },
  get defaultCountryCode() {
    return readOptional("DEFAULT_COUNTRY_CODE", "IN");
  },
  get defaultCurrency() {
    return readOptional("DEFAULT_CURRENCY", "INR");
  },
  get defaultTimeZone() {
    return readOptional("DEFAULT_TIMEZONE", "Asia/Kolkata");
  },
};
