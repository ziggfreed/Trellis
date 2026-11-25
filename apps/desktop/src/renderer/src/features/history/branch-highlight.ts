/**
 * Hovering a branch label in the history highlights that branch's commits.
 *
 * "A branch's commits" here means its first-parent line: start at the
 * label's commit and keep following the first parent. That's the line the
 * graph draws for the branch, and it stays meaningful for long-lived
 * branches like main (following every parent would light up almost the
 * whole history).
 */

/** Map each loaded commit to its first parent (undefined for a root commit). */
export function firstParentMap(
  commits: readonly { sha: string; parents: readonly string[] }[],
): Map<string, string | undefined> {
  return new Map(commits.map((commit) => [commit.sha, commit.parents[0]]))
}

/**
 * The hashes along `tip`'s first-parent line, as far as history has
 * loaded. Empty if `tip` isn't loaded.
 */
export function firstParentLine(
  firstParents: ReadonlyMap<string, string | undefined>,
  tip: string,
): Set<string> {
  const line = new Set<string>()
  let sha: string | undefined = tip
  while (sha !== undefined && firstParents.has(sha) && !line.has(sha)) {
    line.add(sha)
    sha = firstParents.get(sha)
  }
  return line
}
