const encoder = new TextEncoder();

export async function createMediaAccessToken(
  businessId: string,
  mediaAssetId: string,
  sourceEventId: string,
  processingToken: string,
  secret: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`lucy-media:${businessId}:${mediaAssetId}:${sourceEventId}:${processingToken}`),
  );
  return Buffer.from(signature).toString("base64url");
}

export async function verifyMediaAccessToken(
  businessId: string,
  mediaAssetId: string,
  sourceEventId: string,
  processingToken: string,
  token: string,
  secret: string,
): Promise<boolean> {
  const expected = await createMediaAccessToken(businessId, mediaAssetId, sourceEventId, processingToken, secret);
  const suppliedBytes = Buffer.from(token);
  const expectedBytes = Buffer.from(expected);
  if (suppliedBytes.length !== expectedBytes.length) return false;
  let difference = 0;
  for (let index = 0; index < expectedBytes.length; index += 1) {
    difference |= suppliedBytes[index]! ^ expectedBytes[index]!;
  }
  return difference === 0;
}
