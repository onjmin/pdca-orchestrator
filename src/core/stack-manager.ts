// タスクの型定義
export interface Task {
	title: string;
	description: string;
	dod: string;
	strategy?: string;
	reasoning?: string;
	completedSubTasks?: Task[];
	turns: number;
}

// 実行中に状態を保持するシングルトン
class StackManager {
	private stack: Task[] = [];
	// 完了（pop）したタスクの累計カウント
	private _totalPoppedCount = 0;

	// 進捗率の単調性を保証するための内部状態
	private _lastProgress = 0;
	private _maxTotalSeen = 0;

	push(tasks: Task | Task[]) {
		if (Array.isArray(tasks)) {
			this.stack.push(...tasks);
		} else {
			this.stack.push(tasks);
		}
	}

	pop(): Task | undefined {
		const finishedTask = this.stack.pop();
		if (finishedTask) {
			this._totalPoppedCount++; // タスクを消化した実績を記録

			const parent = this.currentTask;
			if (parent) {
				if (!parent.completedSubTasks) {
					parent.completedSubTasks = [];
				}
				parent.completedSubTasks.push(finishedTask);
			}
		}
		return finishedTask;
	}

	get progress(): number {
		const currentDepth = this.stack.length;

		// 1. 完了した分
		const completed = this._totalPoppedCount;

		// 2. 残りの推定（現在のスタック ＋ 各階層で今後見つかるであろう未知の要素）
		// 暫定的に「深さ1につき平均2つ見つかる」と仮定するなどのバッファを持たせる
		const estimatedRemaining = currentDepth * 1.5;

		const total = completed + estimatedRemaining;

		if (total === 0) return 0;

		const computed = Math.round((completed / total) * 100);

		// 進捗は後戻りさせない
		this._lastProgress = Math.max(this._lastProgress, Math.min(99, computed));

		return currentDepth === 0 && completed > 0 ? 100 : this._lastProgress;
	}

	/**
	 * 外部公開用のプロパティ
	 */
	get totalPoppedCount(): number {
		return this._totalPoppedCount;
	}

	get length(): number {
		return this.stack.length;
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
