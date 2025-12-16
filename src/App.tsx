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
function NicenessScore({ score }: { score: number }) {
  const getScoreClass = () => {
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
function MatchTypeBadge({ type, components }: {
  type: WordMatch['type']
  components?: string[]
}) {
  if (type === 'exact') return null

  if (type === 'compound' && components && components.length > 0) {
    return (
      <span className="match-badge compound">
        {components.join(' + ')}
      </span>
    )
  }

  return null
}

interface SearchResults {
  exact: WordMatch[]
  compound: WordMatch[]
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
  const [activeTab, setActiveTab] = useState<'exact' | 'compound'>('exact')

  const [results, setResults] = useState<SearchResults>({
    exact: [],
    compound: [],
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

      const { exact, compound } = findAllMatches(
        titleInfo,
        words,
        wordSet,
        {
          minLength,
          maxResults,
          searchTerm,
          includeCompounds
        }
      )

      setResults({
        exact,
        compound,
        titleInfo,
        searchedTitle: title
      })
      setSearching(false)

      // Auto-select the best tab
      if (exact.length > 0) {
        setActiveTab('exact')
      } else if (compound.length > 0) {
        setActiveTab('compound')
      }
    }, 10)
  }, [title, words, wordSet, minLength, maxResults, searchTerm, includeCompounds])

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
    return activeTab === 'exact' ? results.exact : results.compound
  }, [activeTab, results])

  if (loading) {
    return (
      <div className="app">
        <h1>DURANGO: DUmb ReseArch Name GeneratOr</h1>
        <p>Loading dictionary ({words.length > 0 ? words.length.toLocaleString() : '...'} words)...</p>
      </div>
    )
  }

  return (
    <div className="app">
      <h1>DURANGO: DUmb ReseArch Name GeneratOr</h1>
      <p className="subtitle">
        Create those dumb research project names • Ranked by "niceness" • Loved by CS Researchers
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
            placeholder="Enter your project subtitle..."
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
        </div>
      </div>

      {selectedWord && results.titleInfo && (
        <div className="selected-preview">
          <h3>
            Your World-changing Research Title: <strong>{selectedWord.word.toUpperCase()}</strong>
            <NicenessScore score={selectedWord.niceness} />
          </h3>
          <MatchTypeBadge
            type={selectedWord.type}
            components={selectedWord.components}
          />
          {selectedWord.indices && selectedWord.indices.length > 0 && (
            <div className="preview-title">
              <HighlightedTitle title={results.searchedTitle} indices={selectedWord.indices} />
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
          </div>

          <h2>
            {currentMatches.length} {activeTab} matches
            {currentMatches.length >= maxResults && activeTab === 'exact' && ` (limited to ${maxResults})`}
          </h2>

          {currentMatches.length === 0 ? (
            <p className="no-results">
              {activeTab === 'exact' && 'No exact matches found. Try a longer title or lower minimum length.'}
              {activeTab === 'compound' && 'No compound words found.'}
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
                    <span className="word">{match.word}</span>
                    <NicenessScore score={match.niceness} />
                  </div>
                  <span className="length">{match.word.length} letters</span>
                  <MatchTypeBadge
                    type={match.type}
                    components={match.components}
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
