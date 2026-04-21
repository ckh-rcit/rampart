export type WafAction = 'block' | 'challenge' | 'managed_challenge' | 'js_challenge' | 'skip' | 'log';

export interface BlockResponse {
	status_code?: number;
	content?: string;
	content_type?: string;
}

export interface WafRule {
	id?: string;
	ref?: string;
	description?: string;
	expression: string;
	action: WafAction;
	enabled?: boolean;
	action_parameters?: {
		response?: BlockResponse;
	};
}

export interface ZoneSummary {
	id: string;
	name: string;
	accountId: string;
}

export interface CfList {
	id: string;
	name: string;
	kind: 'ip' | 'redirect' | 'hostname' | 'asn';
	num_items: number;
}

export interface RampartExportPayload {
	metadata: {
		zone: string;
		exportedAt: string;
	};
	rules: WafRule[];
}
