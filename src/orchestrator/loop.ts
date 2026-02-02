import { action } from "./action";
import { check } from "./check";
import { doPhase } from "./do";
import { plan } from "./plan";
import type { PDCAContext, Task } from "./types";

export async function runPDCA(task: Task) {
	let context: PDCAContext = { task, history: [] };

	while (!context.task.done) {
		context = await plan(context);
		context = await doPhase(context);
		context = check(context);
		await action(context);

		context.history.push(JSON.stringify(context.toolResult));
	}

	return context;
}
