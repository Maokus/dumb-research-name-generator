// Types for the matching system
export interface WordMatch {
    word: string
    indices: number[]
    niceness: number
    type: 'exact' | 'compound'
    components?: string[] // For compound words
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
    const letterIndices = indices
        .map(origIdx => titleInfo.letterPositions.indexOf(origIdx))
        .filter(i => i >= 0)

    // 0. Strong bonus for using the first letter of the first word (0 or 25 points)
    // (Pick a value that feels "significant" relative to your other weights.)
    if (titleInfo.words.length > 0) {
        const firstWordFirstLetter = titleInfo.words[0].letterStartIndex
        if (letterIndices.includes(firstWordFirstLetter)) {
            score += 25
        }
    }

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
    const wordCoverage = titleInfo.words.length > 0 ? wordsUsed.size / titleInfo.words.length : 0
    score += wordCoverage * 40

    // 2. Start letter usage: prefer letters from the start of title words (0-30 points)
    let startLetterScore = 0
    for (let i = 0; i < letterIndices.length; i++) {
        const letterIdx = letterIndices[i]
        for (const tw of titleInfo.words) {
            if (letterIdx >= tw.letterStartIndex && letterIdx < tw.letterEndIndex) {
                const posInWord = letterIdx - tw.letterStartIndex
                const wordLength = tw.letterEndIndex - tw.letterStartIndex
                // Score based on position: first letter = 1.0, last ~ 0
                const denom = Math.max(wordLength - 1, 1)
                const posScore = 1 - (posInWord / denom)
                startLetterScore += posScore
                break
            }
        }
    }
    score += (startLetterScore / Math.max(wordLen, 1)) * 30

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
    if (initialsMatched > 0 && titleInfo.initials.length > 0) {
        score += (initialsMatched / titleInfo.initials.length) * 20
    }

    // 4. Word length bonus (0-10 points) - longer words are often nicer
    const lengthBonus = Math.min(wordLen / 10, 1) * 10
    score += lengthBonus

    return Math.round(score * 100) / 100
}



// Build a Set of valid words for O(1) lookup
export function buildWordSet(words: string[]): Set<string> {
    return new Set(words.map(w => w.toLowerCase()))
}

// Build new compound matches by stitching together two exact matches
function generateCompoundMatches(
    titleInfo: TitleInfo,
    exactMatches: WordMatch[],
    wordSet: Set<string>,
    searchLower: string,
    minWordLength: number,
    maxResults: number,
    minComponentLength: number = 3,
    componentPoolSize: number = 80
): WordMatch[] {
    if (maxResults <= 0) return []

    const usableMatches = exactMatches.filter(match => match.word.length >= minComponentLength)
    if (usableMatches.length < 2) return []

    const componentPool = usableMatches.slice(0, componentPoolSize)
    const seen = new Set<string>()
    const compounds: WordMatch[] = []
    const maxCandidates = Math.max(maxResults * 3, componentPool.length)

    for (let i = 0; i < componentPool.length; i++) {
        const first = componentPool[i]
        for (let j = 0; j < componentPool.length; j++) {
            if (i === j) continue

            const second = componentPool[j]
            const combinedWord = first.word + second.word

            if (combinedWord.length < minWordLength) continue
            if (combinedWord.length > titleInfo.letters.length) continue
            if (searchLower && !combinedWord.includes(searchLower)) continue
            if (wordSet.has(combinedWord)) continue // Already a standalone dictionary word
            if (seen.has(combinedWord)) continue

            const indices = findWordInTitle(titleInfo, combinedWord)
            if (!indices) continue

            const niceness = calculateNiceness(titleInfo, combinedWord, indices) * 0.9 // gentle penalty for fabricated words

            compounds.push({
                word: combinedWord,
                indices,
                niceness: Math.round(niceness * 100) / 100,
                type: 'compound',
                components: [first.word, second.word]
            })
            seen.add(combinedWord)

            if (compounds.length >= maxCandidates) break
        }

        if (compounds.length >= maxCandidates) break
    }

    return compounds
        .sort((a, b) => {
            if (b.niceness !== a.niceness) return b.niceness - a.niceness
            if (b.word.length !== a.word.length) return b.word.length - a.word.length
            return a.word.localeCompare(b.word)
        })
        .slice(0, maxResults)
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
    }
): {
    exact: WordMatch[]
    compound: WordMatch[]
} {
    const { minLength, maxResults, searchTerm, includeCompounds } = options
    const searchLower = searchTerm.trim().toLowerCase()
    const allExactMatches: WordMatch[] = []

    for (const word of allWords) {
        if (word.length < minLength) continue
        if (word.length > titleInfo.letters.length) continue
        if (searchLower && !word.includes(searchLower)) continue

        const indices = findWordInTitle(titleInfo, word)
        if (indices) {
            const niceness = calculateNiceness(titleInfo, word, indices)
            allExactMatches.push({
                word,
                indices,
                niceness,
                type: 'exact'
            })
        }
    }

    // Sort by niceness (descending), then by length (descending), then alphabetically
    allExactMatches.sort((a, b) => {
        if (b.niceness !== a.niceness) return b.niceness - a.niceness
        if (b.word.length !== a.word.length) return b.word.length - a.word.length
        return a.word.localeCompare(b.word)
    })

    const exact = allExactMatches.slice(0, maxResults)
    const exactWordSet = new Set(exact.map(m => m.word))

    // Find compound words if enabled (exclude words already in exact matches)
    let compound: WordMatch[] = []
    if (includeCompounds) {
        const compoundLimit = Math.max(1, Math.floor(maxResults / 2))
        const minComponentLength = Math.max(2, Math.min(4, minLength))
        const generated = generateCompoundMatches(
            titleInfo,
            allExactMatches,
            wordSet,
            searchLower,
            minLength,
            compoundLimit,
            minComponentLength
        )
        compound = generated.filter(c => !exactWordSet.has(c.word))
    }

    return { exact, compound }
}
