import { createHmac, createHash } from "node:crypto";

const SERVICE = "asr";
const HOST = "asr.tencentcloudapi.com";
const ENDPOINT = `https://${HOST}`;
const ACTION = "SentenceRecognition";
const VERSION = "2019-06-14";

interface VoiceConfig {
	readonly secretId: string;
	readonly secretKey: string;
}

const loadVoiceConfig = (): VoiceConfig | null => {
	const secretId = process.env.TENCENT_SECRET_ID;
	const secretKey = process.env.TENCENT_SECRET_KEY;
	if (!secretId || !secretKey) return null;
	return { secretId, secretKey };
};

const sha256Hex = (data: string): string => createHash("sha256").update(data).digest("hex");

const hmacSha256 = (key: Buffer, data: string): Buffer =>
	createHmac("sha256", key).update(data).digest();

const buildAuthorization = (
	secretId: string,
	secretKey: string,
	timestamp: number,
	payload: string,
): string => {
	const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
	const credentialScope = `${date}/${SERVICE}/tc3_request`;
	const canonicalRequest = [
		"POST",
		"/",
		"",
		`content-type:application/json; charset=utf-8`,
		`host:${HOST}`,
		`x-tc-action:${ACTION.toLowerCase()}`,
		"",
		"content-type;host;x-tc-action",
		sha256Hex(payload),
	].join("\n");

	const stringToSign = [
		"TC3-HMAC-SHA256",
		String(timestamp),
		credentialScope,
		sha256Hex(canonicalRequest),
	].join("\n");

	const secretDate = hmacSha256(Buffer.from(`TC3${secretKey}`, "utf8"), date);
	const secretService = hmacSha256(secretDate, SERVICE);
	const secretSigning = hmacSha256(secretService, "tc3_request");
	const signature = createHmac("sha256", secretSigning).update(stringToSign).digest("hex");

	return `TC3-HMAC-SHA256 Credential=${secretId}/${credentialScope}, SignedHeaders=content-type;host;x-tc-action, Signature=${signature}`;
};

export async function recognizeVoice(audioBase64: string): Promise<string> {
	const config = loadVoiceConfig();
	if (!config) throw new Error("语音识别未配置，请检查环境变量");

	const timestamp = Math.floor(Date.now() / 1000);
	const body = JSON.stringify({
		ProjectId: 0,
		SubServiceType: 2,
		EngSerViceType: "16k_zh",
		SourceType: 1,
		VoiceFormat: "wav",
		UsrAudioKey: `startday_${timestamp}`,
		Data: audioBase64,
		DataLen: Math.floor((audioBase64.length * 3) / 4),
	});

	const authorization = buildAuthorization(config.secretId, config.secretKey, timestamp, body);

	const response = await fetch(ENDPOINT, {
		method: "POST",
		headers: {
			"Content-Type": "application/json; charset=utf-8",
			"X-TC-Action": ACTION,
			"X-TC-Version": VERSION,
			"X-TC-Timestamp": String(timestamp),
			Authorization: authorization,
		},
		body,
	});

	if (!response.ok) throw new Error(`语音识别请求失败：HTTP ${response.status}`);

	const result = await response.json() as {
		Response?: {
			Error?: { Code?: string; Message?: string };
			Result?: string;
		};
	};

	if (result.Response?.Error) {
		const code = result.Response.Error.Code ?? "";
		const msg = result.Response.Error.Message ?? "未知错误";
		if (code === "FailedOperation.UserNotRegistered") {
			throw new Error("语音识别服务未开通，请在腾讯云控制台开通语音识别服务");
		}
		throw new Error(`语音识别失败：${msg}`);
	}

	return result.Response?.Result ?? "";
}
