import { getLibraryISRCCache } from "./cache";
import { cacheTracks } from "./isrc";

export interface SaveCountState {
	count: number;
	saved: boolean;
	nextEntry: string;
}

function getState(uri: string, isrc: string | undefined): SaveCountState {
	if (!isrc) {
		return {
			count: 0,
			saved: false,
			nextEntry: ""
		};
	}

	const list = getLibraryISRCCache();
	const isrcMatches = list.filter(entry => entry[1] == isrc);
	const saved = isrcMatches.some(entry => entry[0] == uri);

	let nextEntry = "";
	if (saved) {
		const index = isrcMatches.findIndex(entry => entry[0] == uri);
		const nextIndex = (index + 1) % isrcMatches.length;

		nextEntry = isrcMatches[nextIndex][0];
	} else if (isrcMatches.length > 0) {
		nextEntry = isrcMatches[0][0];
	}

	return {
		count: isrcMatches.length,
		saved,
		nextEntry
	};
}

export async function getSaveCountStates(uris: string[]): Promise<Record<string, SaveCountState>> {
	const uniqueUris = [...new Set(uris)];
	if (uniqueUris.length < 1) {
		return {};
	}

	const isrcEntries = await cacheTracks(uniqueUris);
	const isrcByUri = new Map<string, string>(isrcEntries);
	const result: Record<string, SaveCountState> = {};

	for (const uri of uniqueUris) {
		result[uri] = getState(uri, isrcByUri.get(uri));
	}

	return result;
}
