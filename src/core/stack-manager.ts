// タスクの型定義
export interface Task {
	title: string;
	description: string;
	dod: string;
	// インメモリで保持する「計画」の跡地
	strategy?: string;
	reasoning?: string;
}

// 実行中に状態を保持するシングルトン
class StackManager {
	private stack: Task[] = [];

	push(tasks: Task | Task[]) {
		if (Array.isArray(tasks)) {
			this.stack.push(...tasks);
		} else {
			this.stack.push(tasks);
		}
	}

	pop(): Task | undefined {
		return this.stack.pop();
	}

	getStack(): Task[] {
		return [...this.stack];
	}

	get currentTask(): Task | undefined {
		return this.stack[this.stack.length - 1];
	}

	isEmpty(): boolean {
		return this.stack.length === 0;
	}

	updateCurrentTask(patch: Partial<Task>) {
		const current = this.currentTask;
		if (current) {
			Object.assign(current, patch);
		}
	}
}

export const taskStack = new StackManager();
