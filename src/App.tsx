import { useState, useEffect, useCallback, useMemo } from 'react'
import './App.css'
import type { WordMatch, TitleInfo } from './matching'
import {
  analyzeTitleTitle,
  buildWordSet,
  findAllMatches
} from './matching'

// Highlight the matched characters in the title
function HighlightedTitle({ title, indices }: { title: string; indices: number[] }) {
  const indexSet = new Set(indices)

  return (
    <span className="highlighted-title">
      {title.split('').map((char, i) => (
        <span key={i} className={indexSet.has(i) ? 'highlight' : ''}>
          {char}
        </span>
      ))}
    </span>
  )
}

// Format niceness score for display
function NicenessScore({ score, type }: { score: number; type: WordMatch['type'] }) {
  const getScoreClass = () => {
    if (type === 'near') return 'score-near'
    if (score >= 60) return 'score-high'
    if (score >= 40) return 'score-medium'
    return 'score-low'
  }

  return (
    <span className={`niceness-score ${getScoreClass()}`}>
      {score.toFixed(0)}
    </span>
  )
}

// Match type badge
function MatchTypeBadge({ type, components, editDistance }: {
  type: WordMatch['type']
  components?: string[]
  editDistance?: number
}) {
  if (type === 'exact') return null

  if (type === 'compound' && components) {
    return (
      <span className="match-badge compound">
        {components[0]} + {components[1]}
      </span>
    )
  }

  if (type === 'near' && editDistance !== undefined) {
    return (
      <span className="match-badge near">
        ~{editDistance} edit{editDistance !== 1 ? 's' : ''}
      </span>
    )
  }

  return null
}

interface SearchResults {
  exact: WordMatch[]
  compound: WordMatch[]
  near: WordMatch[]
  titleInfo: TitleInfo | null
  searchedTitle: string
}

function App() {
  const [title, setTitle] = useState('')
  const [words, setWords] = useState<string[]>([])
  const [wordSet, setWordSet] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [searching, setSearching] = useState(false)
  const [minLength, setMinLength] = useState(4)
  const [maxResults, setMaxResults] = useState(100)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedWord, setSelectedWord] = useState<WordMatch | null>(null)
  const [includeCompounds, setIncludeCompounds] = useState(true)
  const [includeNearMatches, setIncludeNearMatches] = useState(true)
  const [activeTab, setActiveTab] = useState<'exact' | 'compound' | 'near'>('exact')

  const [results, setResults] = useState<SearchResults>({
    exact: [],
    compound: [],
    near: [],
    titleInfo: null,
    searchedTitle: ''
  })

  // Load the word dictionary
  useEffect(() => {
    fetch('/words_alpha.txt')
      .then(res => res.text())
      .then(text => {
        const wordList = text.split('\n').map(w => w.trim().toLowerCase()).filter(w => w.length > 0)
        setWords(wordList)
        setWordSet(buildWordSet(wordList))
        setLoading(false)
      })
      .catch(err => {
        console.error('Failed to load word list:', err)
        setLoading(false)
      })
  }, [])

  // Perform search when button is clicked
  const performSearch = useCallback(() => {
    if (!title.trim() || words.length === 0) {
      setResults({
        exact: [],
        compound: [],
        near: [],
        titleInfo: null,
        searchedTitle: ''
      })
      return
    }

    setSearching(true)
    setSelectedWord(null)

    // Use setTimeout to allow UI to update before heavy computation
    setTimeout(() => {
      const titleInfo = analyzeTitleTitle(title)

      const { exact, compound, near } = findAllMatches(
        titleInfo,
        words,
        wordSet,
        {
          minLength,
          maxResults,
          searchTerm,
          includeCompounds,
          includeNearMatches
        }
      )

      setResults({
        exact,
        compound,
        near,
        titleInfo,
        searchedTitle: title
      })
      setSearching(false)

      // Auto-select the best tab
      if (exact.length > 0) {
        setActiveTab('exact')
      } else if (compound.length > 0) {
        setActiveTab('compound')
      } else if (near.length > 0) {
        setActiveTab('near')
      }
    }, 10)
  }, [title, words, wordSet, minLength, maxResults, searchTerm, includeCompounds, includeNearMatches])

  // Handle Enter key
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      performSearch()
    }
  }, [performSearch])

  const handleWordClick = useCallback((match: WordMatch) => {
    setSelectedWord(prev => prev?.word === match.word ? null : match)
  }, [])

  // Get the current tab's matches
  const currentMatches = useMemo(() => {
    switch (activeTab) {
      case 'exact': return results.exact
      case 'compound': return results.compound
      case 'near': return results.near
    }
  }, [activeTab, results])

  // Format a near-match word so that only the letters that match the title initials
  // (as a subsequence, left-to-right) are capitalised; others are lowercase.
  function formatNearMatchWord(word: string, initials: string | undefined) {
    if (!initials) return word
    const w = word.split('')
    const low = word.toLowerCase()
    const init = initials.toLowerCase()
    const matched = new Set<number>()

    let prog = 0;
    const result = [];
    let found = false;
    for (const char of w) {
      found = false;
      for (let i = prog; i < initials.length; i++) {
        if (initials[i] == char) {
          result.push(initials[i].toUpperCase())
          prog = i;
          found = true;
        }
      }
      if (!found) {
        result.push(char.toLowerCase());
      }
    }

    return result.join("");

    let ti = 0
    for (let i = 0; i < low.length && ti < init.length; i++) {
      if (low[i] === init[ti]) {
        matched.add(i)
        ti++
      }
    }

    return (
      <span className="near-formatted">
        {w.map((ch, i) => (
          <span key={i}>{matched.has(i) ? ch.toUpperCase() : ch.toLowerCase()}</span>
        ))}
      </span>
    )
  }

  if (loading) {
    return (
      <div className="app">
        <h1>Research Name Generator</h1>
        <p>Loading dictionary ({words.length > 0 ? words.length.toLocaleString() : '...'} words)...</p>
      </div>
    )
  }

  return (
    <div className="app">
      <h1>Research Name Generator</h1>
      <p className="subtitle">
        Create those dumb research project names • Ranked by "niceness"
      </p>

      <div className="input-section">
        <label htmlFor="title-input">Project Title</label>
        <div className="input-with-button">
          <input
            id="title-input"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Enter your project title..."
            className="title-input"
          />
          <button
            onClick={performSearch}
            className="search-button"
            disabled={searching || !title.trim()}
          >
            {searching ? 'Searching...' : 'Find Names'}
          </button>
        </div>
        {results.titleInfo && (
          <p className="initials-hint">
            Initials: <strong>{results.titleInfo.initials.toUpperCase()}</strong>
          </p>
        )}
      </div>

      <div className="controls">
        <div className="control-group">
          <label htmlFor="min-length">Min Word Length</label>
          <input
            id="min-length"
            type="number"
            min={2}
            max={15}
            value={minLength}
            onChange={(e) => setMinLength(Number(e.target.value))}
          />
        </div>
        <div className="control-group">
          <label htmlFor="max-results">Max Results</label>
          <input
            id="max-results"
            type="number"
            min={10}
            max={1000}
            step={10}
            value={maxResults}
            onChange={(e) => setMaxResults(Number(e.target.value))}
          />
        </div>
        <div className="control-group">
          <label htmlFor="search">Filter Words</label>
          <input
            id="search"
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Contains..."
          />
        </div>
        <div className="control-group checkbox-group">
          <label>
            <input
              type="checkbox"
              checked={includeCompounds}
              onChange={(e) => setIncludeCompounds(e.target.checked)}
            />
            Compound words
          </label>
          <label>
            <input
              type="checkbox"
              checked={includeNearMatches}
              onChange={(e) => setIncludeNearMatches(e.target.checked)}
            />
            Near matches
          </label>
        </div>
      </div>

      {selectedWord && results.titleInfo && (
        <div className="selected-preview">
          <h3>
            Your World-changing Research Title: <strong>{selectedWord.type === 'near' ? formatNearMatchWord(selectedWord.word, results.titleInfo?.initials) : selectedWord.word.toUpperCase()}</strong>
            <NicenessScore score={selectedWord.niceness} type={selectedWord.type} />
          </h3>
          <MatchTypeBadge
            type={selectedWord.type}
            components={selectedWord.components}
            editDistance={selectedWord.editDistance}
          />
          {selectedWord.indices && selectedWord.indices.length > 0 && (
            <div className="preview-title">
              <HighlightedTitle title={results.searchedTitle} indices={selectedWord.indices} />
            </div>
          )}
          {selectedWord.type === 'near' && (
            <div className="near-match-info">
              <p>Near match for initials: <strong>{results.titleInfo.initials.toUpperCase()}</strong></p>
            </div>
          )}
        </div>
      )}

      {results.searchedTitle && (
        <div className="results-section">
          <div className="results-tabs">
            <button
              className={`tab ${activeTab === 'exact' ? 'active' : ''}`}
              onClick={() => setActiveTab('exact')}
            >
              Exact ({results.exact.length})
            </button>
            <button
              className={`tab ${activeTab === 'compound' ? 'active' : ''}`}
              onClick={() => setActiveTab('compound')}
              disabled={!includeCompounds}
            >
              Compound ({results.compound.length})
            </button>
            <button
              className={`tab ${activeTab === 'near' ? 'active' : ''}`}
              onClick={() => setActiveTab('near')}
              disabled={!includeNearMatches}
            >
              Near ({results.near.length})
            </button>
          </div>

          <h2>
            {currentMatches.length} {activeTab} matches
            {currentMatches.length >= maxResults && activeTab === 'exact' && ` (limited to ${maxResults})`}
          </h2>

          {currentMatches.length === 0 ? (
            <p className="no-results">
              {activeTab === 'exact' && 'No exact matches found. Try a longer title or lower minimum length.'}
              {activeTab === 'compound' && 'No compound words found.'}
              {activeTab === 'near' && 'No near matches found for the initials.'}
            </p>
          ) : (
            <div className="word-grid">
              {currentMatches.map((match) => (
                <button
                  key={`${match.type}-${match.word}`}
                  className={`word-card ${selectedWord?.word === match.word ? 'selected' : ''} ${match.type}`}
                  onClick={() => handleWordClick(match)}
                >
                  <div className="word-header">
                    <span className="word">{match.type === 'near' ? formatNearMatchWord(match.word, results.titleInfo?.initials) : match.word}</span>
                    <NicenessScore score={match.niceness} type={match.type} />
                  </div>
                  <span className="length">{match.word.length} letters</span>
                  <MatchTypeBadge
                    type={match.type}
                    components={match.components}
                    editDistance={match.editDistance}
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

    </div>
  )
}

export default App
