import { today } from './lib/date';
import { Store } from './lib/store';

/** Dzień aktualnie oglądany w dzienniku. */
export const diaryDate = new Store<string>(today());
