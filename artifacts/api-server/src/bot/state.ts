// Shared runtime state — avoids circular imports between index.ts and commands.ts

export let fakeTypeMode = false;
export let fakeRecordMode = false;

export function setFakeType(v: boolean) { fakeTypeMode = v; }
export function setFakeRecord(v: boolean) { fakeRecordMode = v; }
