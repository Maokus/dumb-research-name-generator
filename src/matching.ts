// Types for the matching system
export interface WordMatch {
    word: string
    indices: number[]
    niceness: number
    type: 'exact' | 'compound' | 'near'
    components?: string[] // For compound words
    editDistance?: number // For near matches
}

export interface TitleInfo {
    original: string
    letters: string // lowercase letters only
    letterPositions: number[] // map from stripped index to original index
    words: TitleWord[]
    initials: string
}

export interface TitleWord {
    word: string
    startIndex: number // in original title
    letterStartIndex: number // in stripped letters
    letterEndIndex: number // in stripped letters (exclusive)
}

// Pre-compute title information for efficient matching
export function analyzeTitleTitle(title: string): TitleInfo {
    const letterPositions: number[] = []
    let letters = ''

    for (let i = 0; i < title.length; i++) {
        if (/[a-z]/i.test(title[i])) {
            letterPositions.push(i)
            letters += title[i].toLowerCase()
        }
    }

    // Extract words from title
    const wordRegex = /[a-zA-Z]+/g
    const words: TitleWord[] = []
    let match: RegExpExecArray | null
    let letterIndex = 0

    while ((match = wordRegex.exec(title)) !== null) {
        const word = match[0].toLowerCase()
        const startIndex = match.index
        const letterStartIndex = letterIndex
        letterIndex += word.length

        words.push({
            word,
            startIndex,
            letterStartIndex,
            letterEndIndex: letterIndex
        })
    }

    // Extract initials (first letter of each word)
    const initials = words.map(w => w.word[0]).join('')

    return {
        original: title,
        letters,
        letterPositions,
        words,
        initials
    }
}

// Find if a word can be formed from non-contiguous characters in the title
// Returns indices in the original title, or null if not found
export function findWordInTitle(titleInfo: TitleInfo, word: string): number[] | null {
    const wordLower = word.toLowerCase()

    if (titleInfo.letters.length < wordLower.length) return null

    const indices: number[] = []
    let titleIdx = 0

    for (const char of wordLower) {
        let found = false
        while (titleIdx < titleInfo.letters.length) {
            if (titleInfo.letters[titleIdx] === char) {
                indices.push(titleInfo.letterPositions[titleIdx])
                titleIdx++
                found = true
                break
            }
            titleIdx++
        }
        if (!found) return null
    }

    return indices
}

// Calculate the "niceness" score for a word match
// Higher score = better match for a project title
export function calculateNiceness(titleInfo: TitleInfo, word: string, indices: number[]): number {
    let score = 0
    const wordLen = word.length

    // Convert original indices to letter indices for easier calculation
    const letterIndices = indices.map(origIdx => titleInfo.letterPositions.indexOf(origIdx))

    // 1. Word coverage: prefer using letters from ALL words in the title (0-40 points)
    const wordsUsed = new Set<number>()
    for (const letterIdx of letterIndices) {
        for (let wi = 0; wi < titleInfo.words.length; wi++) {
            const tw = titleInfo.words[wi]
            if (letterIdx >= tw.letterStartIndex && letterIdx < tw.letterEndIndex) {
                wordsUsed.add(wi)
                break
            }
        }
    }
    const wordCoverage = wordsUsed.size / titleInfo.words.length
    score += wordCoverage * 40

    // 2. Start letter usage: prefer letters from the start of title words (0-30 points)
    let startLetterScore = 0
    for (let i = 0; i < letterIndices.length; i++) {
        const letterIdx = letterIndices[i]
        for (const tw of titleInfo.words) {
            if (letterIdx >= tw.letterStartIndex && letterIdx < tw.letterEndIndex) {
                const posInWord = letterIdx - tw.letterStartIndex
                const wordLength = tw.letterEndIndex - tw.letterStartIndex
                // Score based on position: first letter = 1.0, last = 0
                const posScore = 1 - (posInWord / wordLength)
                startLetterScore += posScore
                break
            }
        }
    }
    score += (startLetterScore / wordLen) * 30

    // 3. Initial matching: bonus if word starts with initials (0-20 points)
    const wordLower = word.toLowerCase()
    let initialsMatched = 0
    for (let i = 0; i < Math.min(wordLower.length, titleInfo.initials.length); i++) {
        if (wordLower[i] === titleInfo.initials[i]) {
            initialsMatched++
        } else {
            break
        }
    }
    if (initialsMatched > 0) {
        score += (initialsMatched / titleInfo.initials.length) * 20
    }

    // 4. Word length bonus (0-10 points) - longer words are often nicer
    const lengthBonus = Math.min(wordLen / 10, 1) * 10
    score += lengthBonus

    return Math.round(score * 100) / 100
}

// Calculate edit distance (Levenshtein distance) between two strings
export function editDistance(a: string, b: string): number {
    const m = a.length
    const n = b.length

    // Use single array optimization for space efficiency
    const prev = new Array(n + 1)
    const curr = new Array(n + 1)

    for (let j = 0; j <= n; j++) {
        prev[j] = j
    }

    for (let i = 1; i <= m; i++) {
        curr[0] = i
        for (let j = 1; j <= n; j++) {
            if (a[i - 1] === b[j - 1]) {
                curr[j] = prev[j - 1]
            } else {
                curr[j] = 1 + Math.min(prev[j - 1], prev[j], curr[j - 1])
            }
        }
        for (let j = 0; j <= n; j++) {
            prev[j] = curr[j]
        }
    }

    return prev[n]
}

// Build a Set of valid words for O(1) lookup
export function buildWordSet(words: string[]): Set<string> {
    return new Set(words.map(w => w.toLowerCase()))
}

// Find compound words (two words stuck together)
export function findCompoundWords(
    titleInfo: TitleInfo,
    wordSet: Set<string>,
    allWords: string[],
    minComponentLength: number = 3,
    maxResults: number = 50
): WordMatch[] {
    const results: WordMatch[] = []
    const seen = new Set<string>()

    // Strategy: For each word, check if it can be split into two valid words
    // Only check words that could potentially be formed from the title
    for (const word of allWords) {
        if (word.length < minComponentLength * 2) continue
        if (word.length > titleInfo.letters.length) continue

        // Try to find this word in the title first
        const indices = findWordInTitle(titleInfo, word)
        if (!indices) continue

        // Now check if this word is a compound of two words
        for (let splitPoint = minComponentLength; splitPoint <= word.length - minComponentLength; splitPoint++) {
            const part1 = word.slice(0, splitPoint)
            const part2 = word.slice(splitPoint)

            if (wordSet.has(part1) && wordSet.has(part2)) {
                if (seen.has(word)) continue
                seen.add(word)

                const niceness = calculateNiceness(titleInfo, word, indices) * 0.8 // Slight penalty for compounds
                results.push({
                    word,
                    indices,
                    niceness,
                    type: 'compound',
                    components: [part1, part2]
                })
                break // Found one valid split, move on
            }
        }

        if (results.length >= maxResults) break
    }

    return results.sort((a, b) => b.niceness - a.niceness)
}

// Find near matches - words close to the initials/acronym
export function findNearMatches(
    titleInfo: TitleInfo,
    allWords: string[],
    maxEditDistance: number = 2,
    maxResults: number = 50
): WordMatch[] {
    const results: WordMatch[] = []
    const initials = titleInfo.initials.toLowerCase()

    if (initials.length < 2) return results

    // Look for words that are close to the initials
    // Also try matching words where initials appear as a subsequence
    // This helps find words like "CLINCH" for "CINCH" (C-I-N-C-H as subsequence)
    const minLen = Math.max(2, initials.length - maxEditDistance)
    const maxLen = initials.length + maxEditDistance + 2 // Allow slightly longer for insertions

    for (const word of allWords) {
        if (word.length < minLen || word.length > maxLen) continue

        const wordLower = word.toLowerCase()

        // Calculate edit distance to the initials
        const distance = editDistance(wordLower, initials)

        // Only consider if edit distance is reasonable and word is not an exact subsequence
        if (distance > 0 && distance <= maxEditDistance) {
            // Check it's not already an exact match in the title
            const exactIndices = findWordInTitle(titleInfo, word)
            if (exactIndices) continue // Skip if it's an exact match

            // Calculate a niceness score based on how close it is to initials
            // Prefer words that start with the same letter as the initials
            let closeness = 1 - (distance / (maxEditDistance + 1))

            // Bonus for matching the first letter
            if (wordLower[0] === initials[0]) {
                closeness += 0.2
            }

            // Bonus for containing the initials as a subsequence
            if (containsSubsequence(wordLower, initials)) {
                closeness += 0.3
            }

            const niceness = Math.min(closeness, 1) * 50 // Max 50 for near matches

            // Map matched initials to original title indices so we can highlight
            // which letters from the title contributed to this near match.
            const matchedInitialIndices: number[] = []
            // Walk through the word and try to match initials (as subsequence)
            let wi = 0
            for (let ii = 0; ii < initials.length && wi < wordLower.length; ii++) {
                for (; wi < wordLower.length; wi++) {
                    if (wordLower[wi] === initials[ii]) {
                        // Use the original index of the first character of the title word
                        // corresponding to this initial
                        if (titleInfo.words[ii]) {
                            matchedInitialIndices.push(titleInfo.words[ii].startIndex)
                        }
                        wi++
                        break
                    }
                }
            }

            results.push({
                word,
                indices: matchedInitialIndices,
                niceness: Math.round(niceness * 100) / 100,
                type: 'near',
                editDistance: distance
            })
        }

        if (results.length >= maxResults * 2) break // Get more, then sort and trim
    }

    return results.sort((a, b) => b.niceness - a.niceness).slice(0, maxResults)
}

// Check if target is a subsequence of source
function containsSubsequence(source: string, target: string): boolean {
    let ti = 0
    for (let si = 0; si < source.length && ti < target.length; si++) {
        if (source[si] === target[ti]) {
            ti++
        }
    }
    return ti === target.length
}

// Main function to find all matches
export function findAllMatches(
    titleInfo: TitleInfo,
    allWords: string[],
    wordSet: Set<string>,
    options: {
        minLength: number
        maxResults: number
        searchTerm: string
        includeCompounds: boolean
        includeNearMatches: boolean
    }
): {
    exact: WordMatch[]
    compound: WordMatch[]
    near: WordMatch[]
} {
    const { minLength, maxResults, searchTerm, includeCompounds, includeNearMatches } = options

    // Find exact matches
    const exactMatches: WordMatch[] = []
    const searchLower = searchTerm.toLowerCase()

    for (const word of allWords) {
        if (word.length < minLength) continue
        if (word.length > titleInfo.letters.length) continue
        if (searchTerm && !word.includes(searchLower)) continue

        const indices = findWordInTitle(titleInfo, word)
        if (indices) {
            const niceness = calculateNiceness(titleInfo, word, indices)
            exactMatches.push({
                word,
                indices,
                niceness,
                type: 'exact'
            })
        }
    }

    // Sort by niceness (descending), then by length (descending), then alphabetically
    exactMatches.sort((a, b) => {
        if (b.niceness !== a.niceness) return b.niceness - a.niceness
        if (b.word.length !== a.word.length) return b.word.length - a.word.length
        return a.word.localeCompare(b.word)
    })

    const exact = exactMatches.slice(0, maxResults)
    const exactWordSet = new Set(exact.map(m => m.word))

    // Find compound words if enabled (exclude words already in exact matches)
    let compound: WordMatch[] = []
    if (includeCompounds) {
        const allCompounds = findCompoundWords(titleInfo, wordSet, allWords, 3, maxResults)
        compound = allCompounds.filter(c => !exactWordSet.has(c.word)).slice(0, Math.floor(maxResults / 2))
    }

    // Find near matches if enabled
    const near = includeNearMatches
        ? findNearMatches(titleInfo, allWords, 2, Math.floor(maxResults / 2))
        : []

    return { exact, compound, near }
}
