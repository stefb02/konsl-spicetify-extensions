import { getSaveCountStates, SaveCountState } from "./save-count";

interface TrackRowData {
	row: HTMLElement;
	uri: string;
	endSection: HTMLElement;
}

interface DomWithFiber extends HTMLElement {
	[key: string]: any;
}

const SELECTORS = {
	MAIN: "main",
	TRACKLIST: ".main-trackList-indexable",
	TRACK_ROW: ".main-trackList-trackListRow",
	END_SECTION: ".main-trackList-rowSectionEnd"
} as const;

const CSS_CLASS = "find-duplicates-save-count-label";

class SaveCountLabelRenderer {
	private updateFrameId: number | null = null;
	private mainObserver: MutationObserver | null = null;
	private pageObserver: MutationObserver | null = null;
	private mainElement: HTMLElement | null = null;
	private initialized = false;

	init() {
		if (this.initialized) {
			return;
		}
		this.initialized = true;

		this.mainObserver = new MutationObserver(mutations => {
			if (this.shouldScheduleFromMutations(mutations)) {
				this.scheduleUpdate();
			}
		});
		this.pageObserver = new MutationObserver(() => this.handlePageMutation());

		this.handlePageMutation();
		this.pageObserver.observe(document.body, {
			childList: true,
			subtree: false
		});

		window.addEventListener("resize", () => this.scheduleUpdate());
		document.addEventListener("visibilitychange", () => this.scheduleUpdate());
	}

	refresh() {
		this.scheduleUpdate();
	}

	private handlePageMutation() {
		const nextMain = document.querySelector(SELECTORS.MAIN) as HTMLElement | null;
		if (nextMain !== this.mainElement) {
			this.mainObserver?.disconnect();
			this.mainElement = nextMain;
			if (this.mainElement) {
				this.mainObserver?.observe(this.mainElement, {
					childList: true,
					subtree: true
				});
			}
		}

		this.scheduleUpdate();
	}

	private scheduleUpdate() {
		if (this.updateFrameId !== null) {
			return;
		}

		this.updateFrameId = window.requestAnimationFrame(() => {
			this.updateFrameId = null;
			void this.updateTracklists();
		});
	}

	private async updateTracklists() {
		const rows = this.getTrackRows();
		if (rows.length < 1) {
			return;
		}

		const states = await getSaveCountStates(rows.map(row => row.uri));

		for (const row of rows) {
			if (!row.row.isConnected) {
				continue;
			}
			this.renderRowLabel(row, states[row.uri]);
		}
	}

	private shouldScheduleFromMutations(mutations: MutationRecord[]): boolean {
		for (const mutation of mutations) {
			if (mutation.type !== "childList") {
				return true;
			}

			for (const node of mutation.addedNodes) {
				if (!this.isOwnLabelNode(node)) {
					return true;
				}
			}

			for (const node of mutation.removedNodes) {
				if (!this.isOwnLabelNode(node)) {
					return true;
				}
			}
		}

		return false;
	}

	private isOwnLabelNode(node: Node): boolean {
		if (!(node instanceof HTMLElement)) {
			return false;
		}

		if (node.classList.contains(CSS_CLASS)) {
			return true;
		}

		return !!node.closest(`.${CSS_CLASS}`);
	}

	private getTrackRows(): TrackRowData[] {
		const tracklists = Array.from(document.querySelectorAll(SELECTORS.TRACKLIST));
		const rows: TrackRowData[] = [];

		for (const tracklist of tracklists) {
			const trackRows = Array.from(tracklist.querySelectorAll(SELECTORS.TRACK_ROW));
			for (const row of trackRows) {
				const rowElement = row as HTMLElement;
				const uri = this.getTrackUri(rowElement);
				const endSection = rowElement.querySelector(SELECTORS.END_SECTION) as HTMLElement | null;
				if (!uri || !endSection) {
					continue;
				}
				rows.push({
					row: rowElement,
					uri,
					endSection
				});
			}
		}

		return rows;
	}

	private getTrackUri(trackRow: HTMLElement): string | null {
		const parent = trackRow.parentElement;
		if (!parent) {
			return null;
		}

		const fiber = this.getFiberFromDom(parent);
		if (!fiber) {
			return null;
		}

		const props = this.getParentProps(fiber, (node: any) => {
			const nodeProps = node.memoizedProps || node.pendingProps;
			return nodeProps && nodeProps.uri;
		});

		if (!props) {
			return null;
		}

		return props.uri ?? null;
	}

	private getFiberFromDom(dom: HTMLElement) {
		const fiberDom = dom as DomWithFiber;
		const props = Object.getOwnPropertyNames(fiberDom);
		for (const key of props) {
			if (key.startsWith("__reactFiber$") || key.startsWith("__reactInternalInstance$")) {
				return fiberDom[key];
			}
		}
		return null;
	}

	private getParentProps(
		fiber: { return: any },
		filterFn = (parent: any) => true
	) {
		if (!fiber) {
			return null;
		}

		let parent = fiber.return;
		while (parent) {
			const props = parent.memoizedProps || parent.pendingProps;
			if (props && (!filterFn || filterFn(parent))) {
				return props;
			}
			parent = parent.return;
		}

		return null;
	}

	private renderRowLabel(rowData: TrackRowData, state?: SaveCountState) {
		const existing = rowData.endSection.querySelector(`.${CSS_CLASS}`) as HTMLAnchorElement | null;
		if (!state) {
			existing?.remove();
			return;
		}

		const count = state.count - (state.saved ? 1 : 0);
		if (count < 1 || !state.nextEntry) {
			existing?.remove();
			return;
		}

		const countLabel = state.saved ? `+${count}` : `${count}`;
		const label = existing ?? this.createLabelElement();
		const hasChanged =
			label.textContent !== countLabel ||
			label.dataset.nextEntry !== state.nextEntry ||
			label.dataset.uri !== rowData.uri;

		if (hasChanged) {
			label.textContent = countLabel;
			label.dataset.nextEntry = state.nextEntry;
			label.dataset.uri = rowData.uri;
		}

		if (!existing) {
			rowData.endSection.prepend(label);
		}
	}

	private createLabelElement(): HTMLAnchorElement {
		const label = document.createElement("a");
		label.className = `TypeElement-mesto-textSubdued-type ${CSS_CLASS}`;
		label.href = "#";
		label.style.marginRight = "12px";
		label.style.textDecoration = "none";
		label.style.cursor = "pointer";
		label.style.alignSelf = "center";
		label.addEventListener("click", this.onLabelClick);
		return label;
	}

	private onLabelClick = (event: MouseEvent) => {
		event.preventDefault();
		event.stopPropagation();

		const target = event.currentTarget as HTMLAnchorElement | null;
		const nextEntry = target?.dataset.nextEntry;
		if (!nextEntry) {
			return;
		}

		const destination = `/collection/tracks?uri=${encodeURIComponent(nextEntry)}`;
		const history = Spicetify.Platform.History;
		const isOnTracksPage = history.location?.pathname === "/collection/tracks";
		if (isOnTracksPage) {
			history.replace(destination);
		} else {
			history.push(destination);
		}
	};
}

const renderer = new SaveCountLabelRenderer();

export function initSaveCountLabels() {
	renderer.init();
}

export function refreshSaveCountLabels() {
	renderer.refresh();
}
