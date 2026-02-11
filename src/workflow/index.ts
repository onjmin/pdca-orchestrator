import { run as runTaskDecomposer } from "./agents/task-decomposer";

/**
 * Workflow Entry Point
 * デフォルトの戦略として Task Decomposer (小人の靴屋) を起動します。
 */
async function bootstrap() {
	try {
		await runTaskDecomposer();
	} catch (error) {
		console.error("Fatal error during workflow execution:");
		console.error(error);
		process.exit(1);
	}
}

bootstrap();
