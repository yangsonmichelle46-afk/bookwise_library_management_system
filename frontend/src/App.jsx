import { useCallback, useEffect, useMemo, useState } from 'react';
import './index.css';
import './ai-assistant.css';
import {
  BookOpen, Plus, RefreshCw, Search, Pencil, Trash2, X, LibraryBig,
  BookCopy, CheckCircle2, AlertCircle, Wifi, WifiOff, Bot, Send, User,
  Sparkles, Download, Moon, Sun, LayoutDashboard, ListFilter, ArrowUpDown,
  Menu, ChevronRight, BookMarked, TrendingUp, CircleAlert, SlidersHorizontal
} from 'lucide-react';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000').replace(/\/$/, '');
const BOOKS_URL = `${API_BASE_URL}/api/books`;
const AUTH_URL = `${API_BASE_URL}/api/auth`;
const fetchOptions = { credentials: 'include' };
const emptyForm = { title: '', author: '', isbn: '', category: '', publishedYear: '', quantity: 0, availableCopies: 0 };

function normalizeBook(book) {
  // MongoDB documents use _id; the UI consistently uses id for edit/delete actions.
  const id = book.id ?? book._id;
  return {
    ...book,
    id: id == null ? '' : String(id),
    publishedYear: book.publishedYear ?? book.published_year ?? '',
    availableCopies: Number(book.availableCopies ?? book.available_copies ?? 0),
    quantity: Number(book.quantity ?? 0),
  };
}

export default function App() {
  const [admin, setAdmin] = useState(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  useEffect(() => {
    fetch(`${AUTH_URL}/me`, { credentials: 'include' })
      .then(async response => { const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.message || 'Not logged in'); return data; })
      .then(data => setAdmin(data.admin))
      .catch(() => setAdmin(null))
      .finally(() => setAuthChecking(false));
  }, []);

  const handleLogin = async event => {
    event.preventDefault(); setAuthError(''); setAuthLoading(true);
    try {
      const response = await fetch(`${AUTH_URL}/login`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: loginEmail, password: loginPassword }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'Login failed.');
      setAdmin(data.admin); setLoginPassword('');
    } catch (error) { setAuthError(error.message); }
    finally { setAuthLoading(false); }
  };

  const handleLogout = async () => {
    try { await fetch(`${AUTH_URL}/logout`, { method: 'POST', credentials: 'include' }); }
    finally { setAdmin(null); setBooks([]); setConnected(false); }
  };
  const [books, setBooks] = useState([]);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [sortBy, setSortBy] = useState('title');
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [message, setMessage] = useState('');
  const [messageError, setMessageError] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState([
    { role: 'assistant', content: 'Hello! I am your AI Library Assistant. Ask me about your collection, available copies, or reading recommendations.' }
  ]);
  const [chatLoading, setChatLoading] = useState(false);
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('lms-theme') === 'dark');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.theme = darkMode ? 'dark' : 'light';
    localStorage.setItem('lms-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  const showMessage = (text, isError = false) => {
    setMessage(text);
    setMessageError(isError);
  };

  // Load the full catalog so the dashboard statistics always reflect the whole library.
  // Search is handled locally in visibleBooks and does not change the totals above.
  const loadBooks = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(BOOKS_URL, fetchOptions);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || 'Could not load books.');
      const data = Array.isArray(payload) ? payload : (payload.data || []);
      if (!Array.isArray(data)) throw new Error('The books API returned an unexpected response.');
      const normalizedBooks = data.map(normalizeBook);
      if (normalizedBooks.some(book => !book.id)) {
        throw new Error('A book record is missing its MongoDB _id/id field. Check the backend response.');
      }
      setBooks(normalizedBooks);
      setConnected(true);
      showMessage(data.length ? `Loaded ${data.length} book record${data.length === 1 ? '' : 's'}.` : 'Your library is currently empty.');
    } catch (error) {
      setConnected(false);
      setBooks([]);
      showMessage(`${error.message} Check that your backend is running at ${API_BASE_URL}.`, true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (admin) loadBooks();
  }, [admin, loadBooks]);

  const categories = useMemo(() => [...new Set(books.map(book => book.category?.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [books]);
  const stats = useMemo(() => ({
    titles: books.length,
    copies: books.reduce((sum, book) => sum + book.quantity, 0),
    available: books.reduce((sum, book) => sum + book.availableCopies, 0),
    lowStock: books.filter(book => book.availableCopies <= 2).length,
  }), [books]);

  const visibleBooks = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase();
    const filtered = books.filter(book => {
      const matchesSearch = !normalizedSearch || [
        book.title,
        book.author,
        book.isbn,
        book.category,
        book.publishedYear,
      ].some(value => String(value ?? '').toLocaleLowerCase().includes(normalizedSearch));
      const matchesCategory = categoryFilter === 'all'
        || (book.category || 'Uncategorized') === categoryFilter;
      return matchesSearch && matchesCategory;
    });

    return [...filtered].sort((a, b) => {
      if (sortBy === 'author') return (a.author || '').localeCompare(b.author || '');
      if (sortBy === 'year-new') return Number(b.publishedYear || 0) - Number(a.publishedYear || 0);
      if (sortBy === 'available') return b.availableCopies - a.availableCopies;
      return (a.title || '').localeCompare(b.title || '');
    });
  }, [books, search, categoryFilter, sortBy]);


  if (authChecking) return (<>\n    <style>{`.auth-screen{min-height:100vh;display:grid;place-items:center;padding:24px;background:linear-gradient(135deg,#edf2ed,#f8f5ec)}.auth-card{width:min(100%,430px);padding:40px;background:#fff;border:1px solid #e5e9e3;border-radius:22px;box-shadow:0 24px 70px rgba(23,61,53,.12);color:#183d35}.auth-logo{width:56px;height:56px;display:grid;place-items:center;border-radius:16px;background:#173d35;color:#f4e8c8;margin-bottom:24px}.auth-card h1{font-size:30px;margin:8px 0}.auth-subtitle,.auth-footnote{color:#68766f;line-height:1.6}.auth-field{display:grid;gap:8px;margin-top:18px;font-size:14px;font-weight:600}.auth-field input{width:100%;padding:13px 14px;border:1px solid #d8e0da;border-radius:10px;font:inherit}.auth-field input:focus{outline:2px solid #b6c9b8;border-color:#507b68}.auth-submit{width:100%;justify-content:center;margin-top:24px}.auth-error{padding:10px 12px;border-radius:9px;background:#fff0ee;color:#a33b30;font-size:14px}.auth-footnote{font-size:12px;margin-top:18px}.admin-email{font-size:13px;color:var(--muted,#66756e);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}@media(max-width:700px){.admin-email{display:none}}`}</style>\n    <div className="auth-screen"><div className="auth-card"><BookOpen size={34} /><h1>Bookwise</h1><p>Checking administrator session…</p></div></div>\n  </>);

  if (!admin) return (
    <>
            <style>{`.auth-screen{min-height:100vh;display:grid;place-items:center;padding:24px;background:linear-gradient(135deg,#edf2ed,#f8f5ec)}.auth-card{width:min(100%,430px);padding:40px;background:#fff;border:1px solid #e5e9e3;border-radius:22px;box-shadow:0 24px 70px rgba(23,61,53,.12);color:#183d35}.auth-logo{width:56px;height:56px;display:grid;place-items:center;border-radius:16px;background:#173d35;color:#f4e8c8;margin-bottom:24px}.auth-card h1{font-size:30px;margin:8px 0}.auth-subtitle,.auth-footnote{color:#68766f;line-height:1.6}.auth-field{display:grid;gap:8px;margin-top:18px;font-size:14px;font-weight:600}.auth-field input{width:100%;padding:13px 14px;border:1px solid #d8e0da;border-radius:10px;font:inherit}.auth-field input:focus{outline:2px solid #b6c9b8;border-color:#507b68}.auth-submit{width:100%;justify-content:center;margin-top:24px}.auth-error{padding:10px 12px;border-radius:9px;background:#fff0ee;color:#a33b30;font-size:14px}.auth-footnote{font-size:12px;margin-top:18px}.admin-email{font-size:13px;color:var(--muted,#66756e);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}@media(max-width:700px){.admin-email{display:none}}`}</style>
      <div className="auth-screen">
      <form className="auth-card" onSubmit={handleLogin}>
        <div className="auth-logo"><BookOpen size={28} /></div>
        <p className="eyebrow">BOOKWISE LIBRARY</p>
        <h1>Administrator login</h1>
        <p className="auth-subtitle">Sign in to manage your library workspace.</p>
        <label className="auth-field">Email address<input type="email" value={loginEmail} onChange={e => setLoginEmail(e.target.value)} autoComplete="username" required /></label>
        <label className="auth-field">Password<input type="password" value={loginPassword} onChange={e => setLoginPassword(e.target.value)} autoComplete="current-password" required /></label>
        {authError && <p className="auth-error">{authError}</p>}
        <button className="button primary auth-submit" type="submit" disabled={authLoading}>{authLoading ? 'Signing in…' : 'Sign in'}</button>
        <p className="auth-footnote">Administrator access only. Contact your system administrator if you need an account.</p>
      </form>
      </div>
    </>
  );


  const openAdd = () => {
    setEditingId(null); setForm({ ...emptyForm }); setFormError(''); setDialogOpen(true);
  };
  const openEdit = (book) => {
    if (!book.id) {
      showMessage('This book record has no ID, so it cannot be edited. Refresh the collection and check the backend response.', true);
      return;
    }
    setEditingId(book.id);
    setForm({ title: book.title || '', author: book.author || '', isbn: book.isbn || '', category: book.category || '', publishedYear: book.publishedYear ?? '', quantity: book.quantity ?? 0, availableCopies: book.availableCopies ?? 0 });
    setFormError(''); setDialogOpen(true);
  };
  const updateField = event => {
    const { name, value } = event.target;
    setForm(current => ({ ...current, [name]: value }));
  };

  const saveBook = async event => {
    event.preventDefault(); setFormError('');
    const quantity = Number(form.quantity);
    const availableCopies = Number(form.availableCopies);
    if (availableCopies > quantity) return setFormError('Available copies cannot be greater than total copies.');
    if (quantity < 0 || availableCopies < 0) return setFormError('Copy counts cannot be negative.');
    const bookData = {
      title: form.title.trim(), author: form.author.trim(), isbn: form.isbn.trim() || null,
      category: form.category.trim() || null,
      publishedYear: form.publishedYear === '' ? null : Number(form.publishedYear), quantity, availableCopies
    };
    setSaving(true);
    try {
      const response = await fetch(editingId ? `${BOOKS_URL}/${editingId}` : BOOKS_URL, {
        method: editingId ? 'PUT' : 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(bookData)
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || 'Could not save book.');
      setDialogOpen(false);
      showMessage(editingId ? 'Book updated successfully.' : 'New book added successfully.');
      await loadBooks();
    } catch (error) {
      setFormError(`${error.message} Check that your backend supports ${editingId ? 'PUT' : 'POST'} /api/books.`);
    } finally { setSaving(false); }
  };

  const sendChatMessage = async event => {
    event.preventDefault();
    const question = chatInput.trim();
    if (!question || chatLoading) return;
    setChatMessages(current => [...current, { role: 'user', content: question }]);
    setChatInput(''); setChatLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/ai/chat`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: question })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || 'The AI assistant could not respond.');
      setChatMessages(current => [...current, { role: 'assistant', content: payload.reply || 'I could not find a response. Please try again.' }]);
    } catch (error) {
      setChatMessages(current => [...current, { role: 'assistant', content: `${error.message} Please check that the backend is running and the Gemini API configuration is valid.` }]);
    } finally { setChatLoading(false); }
  };

  const deleteBook = async book => {
    if (!book.id) {
      showMessage('This book record has no ID, so it cannot be deleted. Refresh the collection and check the backend response.', true);
      return;
    }
    if (!window.confirm(`Delete “${book.title}”? This cannot be undone.`)) return;
    try {
      const response = await fetch(`${BOOKS_URL}/${book.id}`, { method: 'DELETE', credentials: 'include' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || 'Could not delete book.');
      showMessage('Book deleted successfully.'); await loadBooks();
    } catch (error) { showMessage(`${error.message} Make sure your backend supports DELETE /api/books/:id.`, true); }
  };

  const exportCsv = () => {
    const rows = [['Title', 'Author', 'ISBN', 'Category', 'Published Year', 'Total Copies', 'Available Copies'], ...visibleBooks.map(book => [book.title, book.author, book.isbn || '', book.category || 'Uncategorized', book.publishedYear || '', book.quantity, book.availableCopies])];
    const csv = rows.map(row => row.map(value => `"${String(value ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a'); link.href = url; link.download = 'library-books.csv'; link.click(); URL.revokeObjectURL(url);
    showMessage(`Exported ${visibleBooks.length} book record${visibleBooks.length === 1 ? '' : 's'} to CSV.`);
  };

  const useSuggestion = text => setChatInput(text);

  return (
    <div className="app-shell">
      <style>{`.auth-screen{min-height:100vh;display:grid;place-items:center;padding:24px;background:linear-gradient(135deg,#edf2ed,#f8f5ec)}.auth-card{width:min(100%,430px);padding:40px;background:#fff;border:1px solid #e5e9e3;border-radius:22px;box-shadow:0 24px 70px rgba(23,61,53,.12);color:#183d35}.auth-logo{width:56px;height:56px;display:grid;place-items:center;border-radius:16px;background:#173d35;color:#f4e8c8;margin-bottom:24px}.auth-card h1{font-size:30px;margin:8px 0}.auth-subtitle,.auth-footnote{color:#68766f;line-height:1.6}.auth-field{display:grid;gap:8px;margin-top:18px;font-size:14px;font-weight:600}.auth-field input{width:100%;padding:13px 14px;border:1px solid #d8e0da;border-radius:10px;font:inherit}.auth-field input:focus{outline:2px solid #b6c9b8;border-color:#507b68}.auth-submit{width:100%;justify-content:center;margin-top:24px}.auth-error{padding:10px 12px;border-radius:9px;background:#fff0ee;color:#a33b30;font-size:14px}.auth-footnote{font-size:12px;margin-top:18px}.admin-email{font-size:13px;color:var(--muted,#66756e);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}@media(max-width:700px){.admin-email{display:none}}`}</style>
      <aside className={`sidebar ${mobileMenuOpen ? 'sidebar-open' : ''}`}>
        <a className="sidebar-brand" href="#dashboard" onClick={() => setMobileMenuOpen(false)}>
          <span className="brand-mark"><BookOpen size={23} strokeWidth={2.2} /></span>
          <span><strong>Bookwise</strong><small>Library workspace</small></span>
        </a>
        <p className="nav-label">WORKSPACE</p>
        <nav className="side-nav">
          <a className="nav-link active" href="#dashboard" onClick={() => setMobileMenuOpen(false)}><LayoutDashboard size={18} /> Dashboard</a>
          <a className="nav-link" href="#collection" onClick={() => setMobileMenuOpen(false)}><BookMarked size={18} /> Book collection</a>
          <a className="nav-link" href="#assistant" onClick={() => setMobileMenuOpen(false)}><Bot size={18} /> AI assistant</a>
        </nav>
        <div className="sidebar-note">
          <div className="sidebar-note-icon"><Sparkles size={17} /></div>
          <strong>Smart library</strong>
          <p>Manage your books and discover your next great read.</p>
          <a href="#assistant" onClick={() => setMobileMenuOpen(false)}>Ask the assistant <ChevronRight size={14} /></a>
        </div>
        <div className="sidebar-bottom"><span className={`status-dot ${connected ? 'online' : ''}`} />{connected ? 'Database connection active' : 'Waiting for API connection'}</div>
      </aside>

      {mobileMenuOpen && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMobileMenuOpen(false)} />}

      <div className="workspace">
        <header className="topbar">
          <button className="mobile-menu-button" onClick={() => setMobileMenuOpen(value => !value)} aria-label="Toggle navigation"><Menu size={21} /></button>
          <div className="topbar-context"><span className="topbar-kicker">YOUR SPACE</span><strong>Library overview</strong></div>
          <div className="topbar-actions">
            <span className={`connection-badge ${connected ? 'connected' : 'disconnected'}`}>{connected ? <Wifi size={15} /> : <WifiOff size={15} />}{connected ? 'API connected' : 'API offline'}</span>
            <button className="theme-toggle" onClick={() => setDarkMode(value => !value)} title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'} aria-label="Toggle color theme">{darkMode ? <Sun size={18} /> : <Moon size={18} />}</button>
            <button className="button secondary" onClick={handleLogout}>Log out</button><button className="button primary top-add" onClick={openAdd}><Plus size={17} /> Add book</button>
          </div>
        </header>

        <main className="container" id="dashboard">
          <section className="hero-banner">
            <div className="hero-copy">
              <p className="eyebrow"><span className="eyebrow-line" /> LIBRARY DASHBOARD</p>
              <h1>Your library,<br /><em>beautifully organized.</em></h1>
              <p className="hero-description">A clearer view of your collection, inventory, and reading resources — all in one place.</p>
              <div className="hero-actions"><button className="button primary" onClick={openAdd}><Plus size={17} /> Add a new book</button><a className="text-link" href="#collection">Explore collection <ChevronRight size={16} /></a></div>
            </div>
            <div className="hero-art" aria-hidden="true"><div className="art-circle circle-one" /><div className="art-circle circle-two" /><div className="book-stack"><span /><span /><span /><span /><span /></div><div className="art-caption"><BookOpen size={17} /> A world of knowledge</div></div>
            <div className="hero-index">01 <span>/ OVERVIEW</span></div>
          </section>

          <section className="section-heading"><div><p className="eyebrow">AT A GLANCE</p><h2>Collection insights</h2></div><span className="updated-label"><TrendingUp size={15} /> Live inventory</span></section>
          <section className="stats-grid">
            <StatCard icon={<LibraryBig size={21} />} label="Unique titles" value={loading ? '—' : stats.titles} tone="blue" helper="Books in your collection" />
            <StatCard icon={<BookCopy size={21} />} label="Total copies" value={loading ? '—' : stats.copies} tone="purple" helper="Across all titles" />
            <StatCard icon={<CheckCircle2 size={21} />} label="Available copies" value={loading ? '—' : stats.available} tone="green" helper="Ready to borrow" />
            <StatCard icon={<CircleAlert size={21} />} label="Low availability" value={loading ? '—' : stats.lowStock} tone="amber" helper="Titles with 2 or fewer copies" />
          </section>

          <section className="ai-panel" id="assistant">
            <div className="ai-panel-heading">
              <div className="ai-heading-icon"><Bot size={23} /></div>
              <div><p className="eyebrow">YOUR READING COMPANION</p><h2>AI Library Assistant</h2><p className="muted">Ask about your collection, check availability, or get recommendations.</p></div>
              <span className="ai-status"><span className="ai-status-dot" /> Gemini AI</span>
            </div>
            <div className="ai-chat-history" aria-live="polite" aria-label="Chat messages">
              {chatMessages.map((chat, index) => <div className={`ai-message-row ${chat.role === 'user' ? 'user-message-row' : ''}`} key={`${chat.role}-${index}`}><div className={`ai-avatar ${chat.role === 'user' ? 'user-avatar' : ''}`}>{chat.role === 'user' ? <User size={17} /> : <Bot size={17} />}</div><div className={`ai-message-bubble ${chat.role === 'user' ? 'user-bubble' : 'assistant-bubble'}`}><span className="ai-message-label">{chat.role === 'user' ? 'You' : 'Library Assistant'}</span><p>{chat.content}</p></div></div>)}
              {chatLoading && <div className="ai-message-row"><div className="ai-avatar"><Bot size={17} /></div><div className="ai-message-bubble assistant-bubble ai-thinking">Thinking about your question…</div></div>}
            </div>
            <div className="ai-suggestions"><button type="button" onClick={() => useSuggestion('List all the books in our library with their authors.')}><Sparkles size={14} /> List all books</button><button type="button" onClick={() => useSuggestion('Recommend a beginner-friendly programming book.')}><Sparkles size={14} /> Recommend a book</button><button type="button" onClick={() => useSuggestion('Which books have available copies?')}><Sparkles size={14} /> Check availability</button></div>
            <form className="ai-chat-form" onSubmit={sendChatMessage}><input value={chatInput} onChange={event => setChatInput(event.target.value)} placeholder="Ask something about your library…" maxLength={1000} aria-label="Ask the AI Library Assistant" disabled={chatLoading} /><button type="submit" className="ai-send-button" disabled={!chatInput.trim() || chatLoading}><Send size={17} /><span>{chatLoading ? 'Thinking…' : 'Send message'}</span></button></form>
            <p className="ai-disclaimer">AI answers can be imperfect. Gemini AI uses the book catalog supplied by your backend.</p>
          </section>

          <section className="panel collection-panel" id="collection">
            <div className="panel-heading"><div><p className="eyebrow">CATALOG MANAGEMENT</p><h2>Book collection</h2><p className="muted">Search, sort, filter, and manage your library records.</p></div><div className="panel-actions"><button className="button secondary" onClick={() => loadBooks()} disabled={loading}><RefreshCw size={16} className={loading ? 'spin' : ''} /> Refresh</button><button className="button secondary" onClick={exportCsv} disabled={!visibleBooks.length}><Download size={16} /> Export CSV</button></div></div>
            <div className="collection-toolbar"><label className="search-box"><Search size={18} /><input value={search} onChange={event => setSearch(event.target.value)} type="search" placeholder="Search title, author, ISBN, or category…" autoComplete="off" />{search && <button type="button" className="clear-search" aria-label="Clear search" onClick={() => setSearch('')}><X size={16} /></button>}</label><label className="select-control"><ListFilter size={16} /><select value={categoryFilter} onChange={event => setCategoryFilter(event.target.value)} aria-label="Filter by category"><option value="all">All categories</option>{categories.map(category => <option key={category} value={category}>{category}</option>)}{!categories.includes('Uncategorized') && books.some(book => !book.category) && <option value="Uncategorized">Uncategorized</option>}</select></label><label className="select-control"><ArrowUpDown size={16} /><select value={sortBy} onChange={event => setSortBy(event.target.value)} aria-label="Sort books"><option value="title">Sort: Title A–Z</option><option value="author">Sort: Author A–Z</option><option value="year-new">Sort: Newest year</option><option value="available">Sort: Most available</option></select></label></div>
            {message && <p className={`message ${messageError ? 'error' : ''}`}>{messageError ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}{message}</p>}
            <div className="table-meta"><span>{loading ? 'Loading records…' : `Showing ${visibleBooks.length} of ${books.length} record${books.length === 1 ? '' : 's'}`}</span><span><SlidersHorizontal size={14} /> Inventory management</span></div>
            <div className="table-wrap"><table><thead><tr><th>Book details</th><th>Category</th><th>Year</th><th>Total copies</th><th>Available</th><th>Actions</th></tr></thead><tbody>
              {loading ? <tr><td colSpan="6" className="empty-state">Loading your collection…</td></tr> : visibleBooks.length === 0 ? <tr><td colSpan="6" className="empty-state"><BookOpen size={25} /><strong>No books found</strong><span>Try adjusting your filters or add a new title.</span><button className="button secondary" onClick={openAdd}><Plus size={15} /> Add a book</button></td></tr> : visibleBooks.map(book => <tr key={book.id}><td><div className="book-cell"><div className="book-cover"><BookOpen size={18} /></div><div><div className="book-title">{book.title}</div><div className="book-author">{book.author || 'Unknown author'}</div><div className="book-isbn">ISBN: {book.isbn || '—'}</div></div></div></td><td><span className="category-pill">{book.category || 'Uncategorized'}</span></td><td>{book.publishedYear || '—'}</td><td><span className="copies-number">{book.quantity}</span></td><td><span className={`available-count ${book.availableCopies <= 2 ? 'low' : ''}`}>{book.availableCopies}</span>{book.availableCopies <= 2 && <span className="low-stock-label">Low stock</span>}</td><td><div className="action-group"><button className="icon-button edit" title="Edit book" aria-label={`Edit ${book.title}`} onClick={() => openEdit(book)}><Pencil size={16} /></button><button className="icon-button delete" title="Delete book" aria-label={`Delete ${book.title}`} onClick={() => deleteBook(book)}><Trash2 size={16} /></button></div></td></tr>)}
            </tbody></table></div>
          </section>
          <footer className="footer"><span className="footer-mark"><BookOpen size={15} /></span><span>Bookwise Library Management</span><span className="footer-dot">•</span><span>React + Vite</span><span className="footer-spacer" /><span>Built for better reading access</span></footer>
        </main>
      </div>

      {dialogOpen && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setDialogOpen(false); }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><div className="modal-heading"><div><p className="eyebrow">BOOK DETAILS</p><h2 id="dialog-title">{editingId ? 'Edit book details' : 'Add a new book'}</h2><p className="muted">Keep your catalog accurate and up to date.</p></div><button className="close-button" onClick={() => setDialogOpen(false)} aria-label="Close dialog"><X size={20} /></button></div><form onSubmit={saveBook}><div className="form-grid"><Field label="Book title *" name="title" value={form.title} onChange={updateField} required maxLength={255} placeholder="Enter book title" /><Field label="Author *" name="author" value={form.author} onChange={updateField} required maxLength={255} placeholder="Enter author name" /><Field label="ISBN" name="isbn" value={form.isbn} onChange={updateField} maxLength={20} placeholder="ISBN number" /><Field label="Category" name="category" value={form.category} onChange={updateField} maxLength={100} placeholder="e.g. Computer Science" /><Field label="Published year" name="publishedYear" value={form.publishedYear} onChange={updateField} type="number" min="0" max="9999" placeholder="e.g. 2025" /><Field label="Total copies *" name="quantity" value={form.quantity} onChange={updateField} type="number" min="0" required /><Field label="Available copies *" name="availableCopies" value={form.availableCopies} onChange={updateField} type="number" min="0" max={form.quantity} required /></div><p className="form-hint">Available copies cannot be greater than total copies.</p>{formError && <p className="form-error"><AlertCircle size={16} />{formError}</p>}<div className="modal-actions"><button type="button" className="button secondary" onClick={() => setDialogOpen(false)}>Cancel</button><button type="submit" className="button primary" disabled={saving}>{saving ? 'Saving…' : editingId ? 'Save changes' : 'Add book to library'}</button></div></form></section></div>}
    </div>
  );
}

function StatCard({ icon, label, value, tone, helper }) {
  return <article className="stat-card"><div className={`stat-icon ${tone}`}>{icon}</div><div className="stat-content"><span className="stat-label">{label}</span><strong>{value}</strong><small>{helper}</small></div><div className="stat-decoration" /></article>;
}
function Field({ label, ...props }) { return <label className="field">{label}<input {...props} /></label>; }
