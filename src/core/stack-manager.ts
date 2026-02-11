// タスクの型定義
export interface Task {
	title: string;
	description: string;
	dod: string;
	strategy?: string;
	reasoning?: string;
	completedSubTasks?: Task[];
}

// 実行中に状態を保持するシングルトン
class StackManager {
	private stack: Task[] = [];
	// 完了（pop）したタスクの累計カウント
	private _totalPoppedCount = 0;

	// 進捗率の単調性を保証するための内部状態
	private _lastProgress = 0;

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

	/**
	 * 計算論的に正しい進捗率 (%) の算出
	 *
	 * 不変条件:
	 * - 単調非減少
	 * - 完了時に 100%
	 *
	 * 観測上の stack 増減はノイズとして除去する
	 */
	get progress(): number {
		const currentDepth = this.stack.length;
		const total = this._totalPoppedCount + currentDepth;

		if (total === 0) return 0;

		let computed: number;

		// 全てのタスクが pop され、スタックが空なら 100%
		if (currentDepth === 0 && this._totalPoppedCount > 0) {
			computed = 100;
		} else {
			computed = Math.round((this._totalPoppedCount / total) * 100);
		}

		// 計算工学的に正しい進捗：単調非減少を保証
		this._lastProgress = Math.max(this._lastProgress, computed);
		return this._lastProgress;
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
