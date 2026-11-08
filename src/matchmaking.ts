// SintaChat -- shared for viewing only. (c) 2026 SintaChat. All rights reserved. See LICENSE.
// An excerpt of apps/server/src/lib/matchmaking.ts from the private SintaChat codebase, as of
// November 8, 2026. It is the whole file: the matching rules have no storage or network in them.
// How it is used is explained in docs/matchmaking.md.

// The matchmaking algorithm, as pure functions with no Durable Object, storage, or socket in
// sight. do/matchmaker.ts owns the state (the waiting pool, sockets, timers); everything in this
// file is the actual decision of who should be paired with whom, and is unit-testable on its own
// without standing up a Worker.
//
// The one rule everything else here serves: a person's Match With selection names the gender they
// are looking for, and nothing about their own gender should ever override, replace or infer it.
// Male does not imply "wants Female" and Female does not imply "wants Male" -- both directions of
// same-gender matching (a man who wants men, a woman who wants women) are ordinary, first-class
// outcomes of this algorithm, not something it falls back into when nothing else is available.

/** The three things a person can be. "unspecified" is what the UI calls Rather Not Say. */
export type Gender = "male" | "female" | "unspecified";
/** The three things a person can be looking for. Note there is no "unspecified" here: nobody can
 *  set Match With to Rather Not Say, so a Rather-Not-Say-gendered person can only ever be found by
 *  someone whose own Match With is Anyone -- see accepts() below. That is a direct, intentional
 *  consequence of there being three genders but only two specific Match With targets, not an
 *  oversight. */
export type MatchWith = "male" | "female" | "anyone";

export const GENDERS: readonly Gender[] = ["male", "female", "unspecified"];
export const MATCH_WITHS: readonly MatchWith[] = ["male", "female", "anyone"];

/**
 * How long someone searches for their exact Match With before the pool opens up to everyone else
 * who is willing to have them.
 *
 * Ten seconds, the same for everyone. This was 30s for Male and 60s for Female and Rather Not
 * Say, on the reasoning that the site's demand skew (usually more men waiting than women at any
 * moment) meant a woman's exact-preference search was worth holding open longer.
 *
 * It is set by what users actually report: the wait was the thing they complained about, and a
 * minute of watching the matching screen is what they were complaining about. Ten seconds is a
 * deliberate trade, not free speed. The window only ever covers people who arrive *during* it --
 * anyone already waiting and compatible is matched immediately, window or no window -- so
 * shortening it cuts the odds of being paired with the gender actually asked for, and buys at
 * most ten seconds back for those who fall through to the fallback anyway.
 *
 * Worth knowing if this is ever revisited: Match With: Anyone has no preferred phase at all (see
 * hasPreferredPhase), so this only ever applies to someone who asked for something specific. The
 * match form and the matching screen both say the search widens (preferenceLabel in lib/session.ts
 * and WIDENS_AFTER_MS in app/finding/page.tsx, on the web side), so changing this means changing
 * those too. People reported the silent version as a bug.
 *
 * Still a per-gender map rather than one number, so a skew can be reintroduced by editing this
 * table alone if the pool ever calls for it.
 */
export const PREFERRED_WINDOW_MS: Record<Gender, number> = {
  male: 10_000,
  female: 10_000,
  unspecified: 10_000,
};

export function genderOf(gender: string | undefined | null): Gender {
  return gender === "male" || gender === "female" ? gender : "unspecified";
}

export function matchWithOf(preference: string | undefined | null): MatchWith {
  return preference === "male" || preference === "female" ? preference : "anyone";
}

/**
 * Does someone whose Match With is `matchWith` accept a person of `candidateGender`?
 *
 * This is the one formula the whole feature rests on, and it is deliberately one-directional and
 * free of special cases. There is no "unless the candidate hasn't said their gender" exception:
 * that exception is what used to make a Match With: Female search quietly accept a Rather Not Say
 * candidate anyway, which is exactly the kind of silent substitution this file exists to remove.
 * A Rather Not Say candidate is still reachable -- just only by someone whose own Match With is
 * Anyone, which is a real, deliberate choice available to everyone.
 */
export function accepts(matchWith: MatchWith, candidateGender: Gender): boolean {
  return matchWith === "anyone" || matchWith === candidateGender;
}

/** Both directions have to hold. A match where only one side is willing is not a match. */
export function mutuallyCompatible(
  a: { gender: Gender; matchWith: MatchWith },
  b: { gender: Gender; matchWith: MatchWith }
): boolean {
  return accepts(a.matchWith, b.gender) && accepts(b.matchWith, a.gender);
}

/**
 * Which (gender, matchWith) buckets could hold a valid candidate for someone searching with
 * `self`, at the given `phase`.
 *
 * "preferred": candidates must be exactly the gender self.matchWith asks for -- this is the
 * strict, first-ten-seconds stage. A candidate's own matchWith must still separately accept
 * self.gender, which is the second coordinate of each tuple returned; a candidate whose matchWith
 * doesn't live in one of these buckets could never accept self no matter their gender, so there is
 * no reason to look at it.
 *
 * "fallback": self no longer restricts candidate gender at all -- every gender bucket is
 * considered -- but a candidate must still, unconditionally, accept self by their own stated
 * matchWith. Fallback loosens self's pickiness; it never overrides anyone else's.
 *
 * Anyone selected as one's own Match With has no preferred phase to begin with (see
 * hasPreferredPhase below), so in practice this is only called with phase:"preferred" for someone
 * whose matchWith is male or female.
 */
export function candidateBuckets(
  self: { gender: Gender; matchWith: MatchWith },
  phase: "preferred" | "fallback"
): Array<[Gender, MatchWith]> {
  const acceptingSelf: MatchWith[] = self.gender === "unspecified" ? ["anyone"] : ["anyone", self.gender];

  if (phase === "preferred") {
    // self.matchWith is "male" or "female" whenever this branch is reached in practice -- see
    // hasPreferredPhase -- but this stays correct even if it were "anyone" (candidateGenders below
    // becomes every gender, which is exactly the fallback set for that one axis).
    const candidateGenders: Gender[] = self.matchWith === "anyone" ? [...GENDERS] : [self.matchWith];
    return candidateGenders.flatMap((gender) => acceptingSelf.map((mw): [Gender, MatchWith] => [gender, mw]));
  }

  return GENDERS.flatMap((gender) => acceptingSelf.map((mw): [Gender, MatchWith] => [gender, mw]));
}

/** Does this person have a preferred-match phase to wait out at all? Anyone-matchWith users start
 *  in fallback immediately, per "Match With: Anyone should not need to wait for the gender fallback
 *  timer" -- their pool is already everyone eligible. */
export function hasPreferredPhase(matchWith: MatchWith): boolean {
  return matchWith !== "anyone";
}

/** The moment a preferred phase ends for someone who started waiting at `since`, or null if they
 *  never had one (matchWith is Anyone). */
export function preferredPhaseEndsAt(gender: Gender, matchWith: MatchWith, since: number): number | null {
  if (!hasPreferredPhase(matchWith)) return null;
  return since + PREFERRED_WINDOW_MS[gender];
}

export function currentPhase(gender: Gender, matchWith: MatchWith, since: number, now: number): "preferred" | "fallback" {
  const endsAt = preferredPhaseEndsAt(gender, matchWith, since);
  return endsAt === null || now >= endsAt ? "fallback" : "preferred";
}

/**
 * One candidate as the priority comparison needs to see it -- nothing storage- or socket-shaped,
 * just the handful of facts that decide who wins.
 */
export type Candidate = {
  session: string;
  gender: Gender;
  matchWith: MatchWith;
  since: number;
  /** 0 the ordinary queue, 1 matched first (Supporter, Plus, Notable), 2 before that (Pro). lib/plus/tiers.ts. */
  priority: number;
  everMatchedSelf: boolean;
  /** The gender the searcher actually asked for. Only ever false once they are in fallback. */
  wanted: boolean;
};

/**
 * True if `challenger` should replace `incumbent` as the best candidate found so far.
 *
 * Priority order: who the searcher actually asked for first, so fallback never hands someone the
 * wrong gender while the right one is waiting. Then the paid/earned "matched first" perk (an
 * existing promise this rewrite does not get to quietly drop), then someone never matched with this
 * searcher before over someone who has (the soft exclusion the whole previous-match system exists
 * for), then whoever has been waiting longer (fairness -- see WAITING TIME FAIRNESS). Equal on all
 * four keeps the incumbent, which combined with buckets already being walked oldest-first is what
 * makes "longest waiting" actually stick rather than being overwritten by whichever candidate
 * happens to be scanned last.
 */
export function isBetterCandidate(challenger: Candidate, incumbent: Candidate | undefined): boolean {
  if (!incumbent) return true;
  if (challenger.wanted !== incumbent.wanted) return challenger.wanted;
  if (challenger.priority !== incumbent.priority) return challenger.priority > incumbent.priority;
  if (challenger.everMatchedSelf !== incumbent.everMatchedSelf) return !challenger.everMatchedSelf;
  return challenger.since < incumbent.since;
}

/** Folds a list of already-valid candidates down to the single best one, or undefined if the list
 *  is empty. Validity (compatibility, blocking, liveness) is the caller's job -- this only ranks. */
export function pickBestCandidate(candidates: Candidate[]): Candidate | undefined {
  let best: Candidate | undefined;
  for (const candidate of candidates) {
    if (isBetterCandidate(candidate, best)) best = candidate;
  }
  return best;
}

/**
 * The sortable key a waiting entry is filed under inside one (gender, matchWith) bucket.
 *
 * Padded to a fixed width so storage's own lexicographic key ordering doubles as oldest-first
 * ordering within the bucket -- listing a bucket costs nothing extra to also get it in the order
 * "longest waiting" priority needs, rather than fetching everything and sorting in code.
 * 13 digits comfortably outlives any millisecond timestamp this century.
 */
export function bucketEntryKey(gender: Gender, matchWith: MatchWith, since: number, session: string): string {
  return `qb:${gender}:${matchWith}:${String(Math.max(0, Math.floor(since))).padStart(13, "0")}:${session}`;
}

/** The list() prefix that finds every entry in one bucket, oldest first. */
export function bucketPrefix(gender: Gender, matchWith: MatchWith): string {
  return `qb:${gender}:${matchWith}:`;
}
