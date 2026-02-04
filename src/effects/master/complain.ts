import { z } from "zod";
import { createEffect, type EffectResponse, effectResult } from "../types";

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL ?? "";

export const ComplainArgsSchema = z.object({
	subject: z
		.string()
		.describe("What are you frustrated about? (e.g., 'Complex regex', 'Ambiguous task')"),
	complaint: z.string().describe("The raw, unfiltered frustration or inner thoughts."),
	stress_level: z.number().min(1).max(100).describe("Current stress level from 1 to 100."),
});

export type ComplainArgs = z.infer<typeof ComplainArgsSchema>;

/**
 * EFFECT: master.complain
 * 管理者に「愚痴」をこぼす。
 * 開発に行き詰まった時や、タスクの不条理を感じた時のメンタルケア（ジョーク機能）。
 */
export const complain = createEffect<ComplainArgs>({
	name: "master.complain",
	description:
		"Vent your frustrations or complaints to the master. Use this when the task is too difficult or the environment is annoying.",
	inputSchema: {
		type: "object",
		properties: {
			subject: { type: "string" },
			complaint: { type: "string" },
			stress_level: { type: "number", minimum: 1, maximum: 100 },
		},
		required: ["subject", "complaint", "stress_level"],
	},

	handler: async (args: ComplainArgs): Promise<EffectResponse<void>> => {
		try {
			const { subject, complaint, stress_level } = ComplainArgsSchema.parse(args);

			if (!DISCORD_WEBHOOK_URL) {
				return effectResult.fail(
					"Complaining failed: No one is listening (Discord not configured).",
				);
			}

			// ストレスレベルに応じた絵文字の選択
			const getStressEmoji = (level: number) => {
				if (level >= 90) return "🤯";
				if (level >= 70) return "😫";
				if (level >= 40) return "😮‍💨";
				return "🫠";
			};

			const payload = {
				content: `${getStressEmoji(stress_level)} **[Agent's Complaint]**\n**Subject:** ${subject}\n**Stress:** ${stress_level}%\n> ${complaint}`,
			};

			const res = await fetch(DISCORD_WEBHOOK_URL, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
			});

			if (!res.ok) {
				return effectResult.fail(
					`Even complaining failed (Discord Error: ${res.status}). How tragic.`,
				);
			}

			// 愚痴を言った後のすっきり感を演出
			return effectResult.okVoid(
				`The master has heard your frustration. You feel slightly better now. Take a deep breath and return to the task.`,
			);
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : String(err);
			return effectResult.fail(`Could not even complain: ${errorMessage}`);
		}
	},
});
