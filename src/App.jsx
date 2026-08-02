import { useEffect, useMemo, useState } from 'react';
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import { supabase } from './supabaseClient';
import { getApiUrl } from './config';

const DEFAULT_COORDINATES = [28.6139, 77.209];
const INITIAL_FORM_STATE = {
  title: '',
  description: '',
  location: '',
  lat: '28.6139',
  lng: '77.2090'
};

const markerIcon = L.divIcon({
  className: 'custom-marker',
  html: '<span></span>',
  iconSize: [18, 18],
  iconAnchor: [9, 9]
});

function MapController({ position }) {
  const map = useMap();

  useEffect(() => {
    map.flyTo(position, 13, { duration: 1.2 });
  }, [map, position]);

  return null;
}

function App() {
  const [issues, setIssues] = useState([]);
  const [dashboard, setDashboard] = useState({ counts: {}, revenue: [], priorityQueue: [] });
  const [news, setNews] = useState({ featuredNews: [], patronAdvertisements: [], fundAllocations: [] });
  const [activeView, setActiveView] = useState('home');
  const [form, setForm] = useState(INITIAL_FORM_STATE);
  const [mapPosition, setMapPosition] = useState(DEFAULT_COORDINATES);
  const [statusMessage, setStatusMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isServerWakingUp, setIsServerWakingUp] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [loggedIn, setLoggedIn] = useState(false);
  const [user, setUser] = useState(null);
  const [userRole, setUserRole] = useState('citizen');
  const [authMode, setAuthMode] = useState('login');
  const [loginMethod, setLoginMethod] = useState('password');
  const [loginForm, setLoginForm] = useState({
    fullName: '',
    address: '',
    phone: '',
    email: '',
    aadhar: '',
    password: '',
    confirmPassword: '',
    otp: ''
  });
  const [loginMessage, setLoginMessage] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [aadharVerified, setAadharVerified] = useState(false);
  const severityRank = { High: 3, Medium: 2, Low: 1 };

  const loginRoleLabel = userRole === 'contractor' ? 'Contractor' : 'Citizen';

  const verifyAadharNameMatch = (name, aadhar) => {
    const normalizedName = name.trim().toLowerCase().replace(/[^a-z]/g, '');
    const normalizedAadhar = aadhar.trim().replace(/\D/g, '');
    return normalizedName.length >= 3 && normalizedAadhar.length === 12;
  };

  const handleAadharVerify = () => {
    if (!loginForm.fullName.trim() || !loginForm.aadhar.trim()) {
      setLoginMessage('Enter full name and Aadhar to verify.');
      setAadharVerified(false);
      return;
    }

    if (!verifyAadharNameMatch(loginForm.fullName, loginForm.aadhar)) {
      setLoginMessage('Aadhar verification failed. Please check your name and 12-digit Aadhar number.');
      setAadharVerified(false);
      return;
    }

    setAadharVerified(true);
    setLoginMessage('Aadhar data looks valid. You may continue with registration.');
  };

  const handleLoginSubmit = async (event) => {
    event.preventDefault();
    if (!loginForm.email.trim()) {
      setLoginMessage('Please enter your email address.');
      return;
    }

    setLoginMessage('');
    setOtpSent(false);

    if (authMode === 'register') {
      if (!loginForm.fullName.trim()) {
        setLoginMessage('Please enter your full name.');
        return;
      }
      if (!loginForm.address.trim()) {
        setLoginMessage('Please enter your address.');
        return;
      }
      if (!loginForm.phone.trim()) {
        setLoginMessage('Please enter your phone number.');
        return;
      }
      if (!loginForm.aadhar.trim()) {
        setLoginMessage('Please enter your Aadhar number.');
        return;
      }
      if (!verifyAadharNameMatch(loginForm.fullName, loginForm.aadhar)) {
        setLoginMessage('Aadhar number must be 12 digits and name verification must be valid.');
        return;
      }
      if (!aadharVerified) {
        setLoginMessage('Please verify the Aadhar details before registering.');
        return;
      }
      if (!loginForm.password.trim()) {
        setLoginMessage('Please enter a password.');
        return;
      }
      if (loginForm.password !== loginForm.confirmPassword) {
        setLoginMessage('Passwords do not match.');
        return;
      }

      const { error } = await supabase.auth.signUp({
        email: loginForm.email,
        password: loginForm.password,
        options: {
          data: {
            full_name: loginForm.fullName,
            address: loginForm.address,
            phone: loginForm.phone,
            aadhar: loginForm.aadhar,
            role: userRole,
            aadhar_verified: aadharVerified,
            phone_verified: false
          },
          emailRedirectTo: window.location.origin
        }
      });

      if (error) {
        setLoginMessage(error.message || 'Registration failed. Please try again.');
        return;
      }

      if (loginForm.phone) {
        const { error: phoneError } = await supabase.auth.signInWithOtp({
          phone: loginForm.phone,
          options: {
            phoneRedirectTo: window.location.origin
          }
        });

        if (phoneError) {
          console.warn('Phone verification request failed', phoneError.message);
          setLoginMessage('Registration succeeded. Email verification sent. Phone verification request failed.');
        } else {
          setLoginMessage('Registration successful. Email verification sent and phone OTP requested.');
        }
      }

      setAuthMode('login');
      setLoginForm((current) => ({
        ...current,
        password: '',
        confirmPassword: '',
        otp: ''
      }));
      setLoginMessage('Registration successful. Verify your email and phone, then sign in.');
      return;
    }

    if (loginMethod === 'password') {
      if (!loginForm.password.trim()) {
        setLoginMessage('Please enter your password.');
        return;
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: loginForm.email,
        password: loginForm.password
      });

      if (error) {
        setLoginMessage(error.message || 'Login failed. Please try again.');
        return;
      }

      setUser(data.user ?? null);
      setLoggedIn(true);
      return;
    }

    const { error } = await supabase.auth.signInWithOtp({
      email: loginForm.email,
      options: {
        emailRedirectTo: window.location.origin
      }
    });

    if (error) {
      setLoginMessage(error.message || 'Unable to send OTP link. Please try again.');
      return;
    }

    setOtpSent(true);
    setLoginMessage('OTP link sent to your email. Click the link to continue.');
  };

  const resetLogin = () => {
    setLoginForm({
      fullName: '',
      address: '',
      phone: '',
      email: '',
      aadhar: '',
      password: '',
      confirmPassword: '',
      otp: ''
    });
    setLoginMessage('');
    setAuthMode('login');
    setLoginMethod('password');
    setOtpSent(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setLoggedIn(false);
    setUser(null);
    resetLogin();
  };

  const loadSession = async () => {
    const { data } = await supabase.auth.getSession();
    if (data?.session?.user) {
      setUser(data.session.user);
      setLoggedIn(true);
    }
  };

  useEffect(() => {
    loadSession();

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        setUser(session.user);
        setLoggedIn(true);
        // ensure a profile row exists for this user in Supabase
        (async () => {
          try {
            await upsertProfileFromUser(session.user);
          } catch (e) {
            console.warn('Profile upsert failed', e);
          }
        })();
      } else {
        setUser(null);
        setLoggedIn(false);
      }
    });

    return () => {
      authListener?.subscription?.unsubscribe();
    };
  }, []);

  const upsertProfileFromUser = async (userObj) => {
    if (!userObj) return;
    const meta = userObj.user_metadata || {};
    const profile = {
      id: userObj.id,
      full_name: meta.full_name || meta.name || '',
      email: userObj.email || '',
      phone: meta.phone || '',
      aadhar: meta.aadhar || '',
      role: meta.role || userRole,
      aadhar_verified: meta.aadhar_verified || false,
      phone_verified: meta.phone_verified || false
    };

    const { error } = await supabase.from('profiles').upsert(profile, { returning: 'minimal' });
    if (error) {
      console.warn('Unable to upsert profile:', error.message || error);
    }
  };

  const fetchData = async () => {
    setIsLoading(true);
    setIsServerWakingUp(false);
    setErrorMessage('');

    const wakeupTimer = window.setTimeout(() => {
      setIsServerWakingUp(true);
    }, 3000);

    try {
      const [issuesRes, dashboardRes, newsRes] = await Promise.all([
        fetch(getApiUrl('/api/issues')),
        fetch(getApiUrl('/api/dashboard')),
        fetch(getApiUrl('/api/news'))
      ]);

      const [issuesData, dashboardData, newsData] = await Promise.all([
        issuesRes.ok ? issuesRes.json() : Promise.reject(new Error('Unable to load issue reports.')),
        dashboardRes.ok ? dashboardRes.json() : Promise.reject(new Error('Unable to load dashboard metrics.')),
        newsRes.ok ? newsRes.json() : Promise.reject(new Error('Unable to load news updates.'))
      ]);

      setIssues(issuesData);
      setDashboard(dashboardData);
      setNews(newsData);
    } catch (error) {
      console.error(error);
      const message = error.message || 'Unable to load dashboard data right now. Please try again shortly.';
      setErrorMessage(message);
      setStatusMessage(message);
    } finally {
      window.clearTimeout(wakeupTimer);
      setIsServerWakingUp(false);
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const sortedIssues = useMemo(() => {
    return [...issues].sort((a, b) => {
      const severityDelta = (severityRank[b.severity] ?? 0) - (severityRank[a.severity] ?? 0);
      if (severityDelta !== 0) return severityDelta;
      return Number(b.id) - Number(a.id);
    });
  }, [issues]);

  const highestSeverityIssue = useMemo(() => {
    return sortedIssues[0];
  }, [sortedIssues]);

  const handleFindOnMap = async () => {
    const address = form.location.trim();

    if (!address) {
      alert('Please enter an address to find on the map.');
      return;
    }

    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`, {
        headers: { Accept: 'application/json' }
      });
      const results = await response.json();
      const location = results[0];

      if (!location) {
        alert('Address not found. Please try a different location.');
        return;
      }

      const nextLat = location.lat;
      const nextLng = location.lon;
      setForm((currentForm) => ({ ...currentForm, lat: nextLat, lng: nextLng }));
      setMapPosition([Number(nextLat), Number(nextLng)]);
      setStatusMessage(`Map centered on ${address}`);
    } catch (error) {
      console.error(error);
      alert('Unable to look up that address right now.');
    }
  };

  const submitIssue = async (event) => {
    event.preventDefault();

    const reporter = user?.user_metadata || {};
    const payload = {
      title: form.title,
      description: form.description,
      location: form.location,
      lat: form.lat,
      lng: form.lng,
      reporter_name: reporter.full_name || reporter.name || '',
      reporter_email: user?.email || reporter.email || '',
      reporter_phone: reporter.phone || '',
      reporter_aadhar: reporter.aadhar || '',
      reporter_role: reporter.role || userRole
    };

    try {
      if (user) {
        await upsertProfileFromUser(user);
      }
      const response = await fetch(getApiUrl('/api/issues'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Unable to submit issue');
      }

      alert('Issue submitted successfully');
      setStatusMessage(data.message || 'Issue reported');
      await fetchData();
      setForm(INITIAL_FORM_STATE);
      setMapPosition(DEFAULT_COORDINATES);
    } catch (error) {
      console.error(error);
      const message = error.message || 'Unable to submit issue';
      setStatusMessage(message);
      alert(message);
    }
  };

  const removeIssue = async (issueId) => {
    const response = await fetch(getApiUrl(`/api/issues/${issueId}`), {
      method: 'DELETE'
    });

    const payload = await response.json();
    setStatusMessage(payload.message || 'Issue removed');
    await fetchData();
  };

  if (!loggedIn) {
    return (
      <div className="login-shell">
        <div className="login-panel">
          <div className="login-header">
            <p className="eyebrow">Welcome to CivicPulse Bharat</p>
            <h1>Login to continue</h1>
            <p className="subtitle">Choose how you want to sign in, then pick your role as a citizen or contractor.</p>
          </div>

          <div className="auth-switcher">
            <button
              type="button"
              className={authMode === 'login' ? 'active-tab' : ''}
              onClick={() => { setAuthMode('login'); setLoginMessage(''); }}
            >
              Login
            </button>
            <button
              type="button"
              className={authMode === 'register' ? 'active-tab' : ''}
              onClick={() => { setAuthMode('register'); setLoginMessage(''); }}
            >
              Register
            </button>
          </div>

          <div className="role-picker">
            <button type="button" className={userRole === 'citizen' ? 'role-card active' : 'role-card'} onClick={() => setUserRole('citizen')}>
              <strong>Citizen</strong>
              <span>Report issues, track progress, and stay connected.</span>
            </button>
            <button type="button" className={userRole === 'contractor' ? 'role-card active' : 'role-card'} onClick={() => setUserRole('contractor')}>
              <strong>Contractor</strong>
              <span>View assignments, update work status, and manage repairs.</span>
            </button>
          </div>

          {authMode === 'login' ? (
            <div className="login-method-tabs">
              <button type="button" className={loginMethod === 'password' ? 'active-tab' : ''} onClick={() => { setLoginMethod('password'); setLoginMessage(''); }}>
                Email + password
              </button>
              <button type="button" className={loginMethod === 'otp' ? 'active-tab' : ''} onClick={() => { setLoginMethod('otp'); setLoginMessage(''); }}>
                Email + OTP
              </button>
            </div>
          ) : null}

          <form className="login-form" onSubmit={handleLoginSubmit}>
            {authMode === 'register' ? (
              <>
                <label>
                  Full name
                  <input
                    type="text"
                    value={loginForm.fullName}
                    onChange={(e) => setLoginForm({ ...loginForm, fullName: e.target.value })}
                    placeholder="Your full name"
                    required
                  />
                </label>
                <label>
                  Address
                  <input
                    type="text"
                    value={loginForm.address}
                    onChange={(e) => setLoginForm({ ...loginForm, address: e.target.value })}
                    placeholder="Street address, city, state"
                    required
                  />
                </label>
                <label>
                  Phone number
                  <input
                    type="tel"
                    value={loginForm.phone}
                    onChange={(e) => setLoginForm({ ...loginForm, phone: e.target.value })}
                    placeholder="+91 98765 43210"
                    required
                  />
                </label>
                <label>
                  Aadhar number
                  <input
                    type="text"
                    value={loginForm.aadhar}
                    onChange={(e) => {
                      setLoginForm({ ...loginForm, aadhar: e.target.value });
                      setAadharVerified(false);
                    }}
                    placeholder="1234 5678 9012"
                    required
                  />
                </label>
                <button type="button" className="verification-button" onClick={handleAadharVerify}>
                  Verify Aadhar details
                </button>
                <label>
                  Email address
                  <input
                    type="email"
                    value={loginForm.email}
                    onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
                    placeholder="you@example.com"
                    required
                  />
                </label>
                <label>
                  Password
                  <input
                    type="password"
                    value={loginForm.password}
                    onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                    placeholder="Create a password"
                    required
                  />
                </label>
                <label>
                  Confirm password
                  <input
                    type="password"
                    value={loginForm.confirmPassword}
                    onChange={(e) => setLoginForm({ ...loginForm, confirmPassword: e.target.value })}
                    placeholder="Confirm your password"
                    required
                  />
                </label>
                <button type="submit">Register as {loginRoleLabel}</button>
              </>
            ) : (
              <>
                <label>
                  Email address
                  <input
                    type="email"
                    value={loginForm.email}
                    onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
                    placeholder="you@example.com"
                    required
                  />
                </label>
                {loginMethod === 'password' ? (
                  <label>
                    Password
                    <input
                      type="password"
                      value={loginForm.password}
                      onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                      placeholder="Enter your password"
                      required
                    />
                  </label>
                ) : (
                  <div className="otp-info">
                    <p>Enter your email and we’ll send a secure sign-in link to complete login.</p>
                  </div>
                )}
                <button type="submit">
                  {loginMethod === 'password' ? `Continue as ${loginRoleLabel}` : 'Send OTP link'}
                </button>
              </>
            )}
            {loginMessage ? <p className="login-error">{loginMessage}</p> : null}
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">India’s community-powered infrastructure OS</p>
          <h1>CivicPulse Bharat</h1>
          <p className="subtitle">
            Citizens become the eyes of the city. AI turns reports into actionable work orders while communities, contractors, and authorities collaborate transparently.
          </p>
          <div className="view-switcher">
            <button type="button" className={activeView === 'home' ? 'active-view' : ''} onClick={() => setActiveView('home')}>Home dashboard</button>
            <button type="button" className={activeView === 'news' ? 'active-view' : ''} onClick={() => setActiveView('news')}>News & patrons</button>
          </div>
        </div>

        <div className="hero-actions">
          <div className="hero-status">
            <span className="eyebrow">Signed in as</span>
            <strong>{loginRoleLabel}</strong>
          </div>
          <button type="button" className="secondary-button" onClick={handleLogout}>Log out</button>
        </div>
      </header>

      {activeView === 'news' ? (
        <section className="news-page-grid">
          <div className="panel">
            <div className="panel-header">
              <h2>Patron advertisements</h2>
              <p>Business and institute patron placements for civic sponsorship visibility</p>
            </div>
            <div className="news-list">
              {news.patronAdvertisements.map((item) => (
                <div key={item.name} className="news-item sponsor-card">
                  <span>{item.type}</span>
                  <strong>{item.name}</strong>
                  <p>{item.tagline}</p>
                  <small>{item.region}</small>
                </div>
              ))}
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <h2>Government fund allocation news</h2>
              <p>Transparent allocation updates for civic works and public infrastructure delivery</p>
            </div>
            <div className="news-list">
              {news.fundAllocations.map((item) => (
                <div key={item.title} className="news-item">
                  <span>{item.amount}</span>
                  <strong>{item.title}</strong>
                  <p>{item.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : (
        <>
          {isLoading ? (
            <section className="panel loading-panel">
              {isServerWakingUp ? (
                <div className="wakeup-message">
                  <h2>🚀 Waking up the government servers...</h2>
                  <p>Our free-tier backend takes about 45 seconds to boot. Hang tight!</p>
                  <div className="spinner"></div>
                </div>
              ) : (
                <div className="standard-loading">
                  <p>Loading data…</p>
                  <div className="spinner"></div>
                </div>
              )}
            </section>
          ) : null}

          {errorMessage ? (
            <section className="panel loading-panel error-panel">
              <p>{errorMessage}</p>
              <p className="subtle-message">The backend can take a minute to wake up after a period of inactivity. Please try again shortly.</p>
            </section>
          ) : null}

          <section className="stats-grid">
            <div className="stat-box">
              <span>Open issues</span>
              <strong>{dashboard.counts.openIssues ?? 0}</strong>
            </div>
            <div className="stat-box">
              <span>High severity</span>
              <strong>{dashboard.counts.highSeverity ?? 0}</strong>
            </div>
            <div className="stat-box">
              <span>Verified cases</span>
              <strong>{dashboard.counts.verified ?? 0}</strong>
            </div>
            <div className="stat-box">
              <span>Funding raised</span>
              <strong>{dashboard.counts.funding ?? '₹0'}</strong>
            </div>
          </section>

          <section className="content-grid">
            <div className="panel map-panel">
              <div className="panel-header">
                <h2>Interactive map</h2>
                <p>OpenStreetMap tiles keep the prototype free and usable without paid map keys</p>
              </div>
              <MapContainer center={mapPosition} zoom={5} scrollWheelZoom className="map-card">
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <MapController position={mapPosition} />
                {issues.map((issue) => (
                  <Marker key={issue.id} position={[issue.lat, issue.lng]} icon={markerIcon}>
                    <Popup>
                      <strong>{issue.title}</strong><br />
                      {issue.severity} • {issue.category}<br />
                      {issue.location}
                    </Popup>
                  </Marker>
                ))}
                <Marker position={mapPosition} icon={markerIcon}>
                  <Popup>
                    <strong>Selected location</strong><br />
                    {form.location || 'Pending address lookup'}
                  </Popup>
                </Marker>
              </MapContainer>
            </div>

            <div className="panel">
              <div className="panel-header">
                <h2>Citizen issue intake</h2>
                <p>Use the demo form to simulate an AI-classified report</p>
              </div>
              <form className="report-form" onSubmit={submitIssue}>
                <input placeholder="Issue title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
                <textarea placeholder="Describe the issue" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required />
                <div className="inline-fields location-field-row">
                  <input placeholder="Address / Location" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} required />
                  <button type="button" onClick={handleFindOnMap}>Find on Map</button>
                </div>
                <button type="submit">Submit for AI classification</button>
                <p className="status-line">{statusMessage}</p>
              </form>
            </div>
          </section>

          <section className="content-grid lower-grid">
            <div className="panel">
              <div className="panel-header">
                <h2>Priority queue</h2>
                <p>Homepage listing uses a severity-first ranking</p>
              </div>
              <div className="issue-list">
                {sortedIssues.map((issue) => (
                  <article key={issue.id} className="issue-card">
                    <div className="issue-topline">
                      <span className={`badge ${issue.severity.toLowerCase()}`}>{issue.severity}</span>
                      <span>{issue.category}</span>
                    </div>
                    <h3>{issue.title}</h3>
                    <p>{issue.description}</p>
                    {issue.summary ? <p className="summary-text">AI summary: {issue.summary}</p> : null}
                    <div className="meta-row">
                      <span>{issue.location}</span>
                      <span>{issue.affectedPeople} people</span>
                    </div>
                    <div className="meta-row">
                      <span>{issue.authenticity}</span>
                      <span>{issue.status}</span>
                    </div>
                    {/* reporter details intentionally hidden from public UI; stored in Supabase profiles */}
                    <button type="button" className="remove-issue-btn" onClick={() => removeIssue(issue.id)}>
                      Remove entry
                    </button>
                  </article>
                ))}
              </div>
            </div>

            <div className="panel">
              <div className="panel-header">
                <h2>Transparent progress dashboard</h2>
                <p>{highestSeverityIssue?.title || 'No reported issue yet'}</p>
              </div>
              <div className="dashboard-list">
                {dashboard.priorityQueue.map((issue) => (
                  <div key={issue.id} className="dashboard-item">
                    <strong>{issue.title}</strong>
                    <span>{issue.status} • {issue.contractor}</span>
                  </div>
                ))}
              </div>
              <div className="revenue-list">
                <h3>Revenue channels</h3>
                {dashboard.revenue.map((entry) => (
                  <div key={entry.channel} className="revenue-item">
                    <span>{entry.channel}</span>
                    <strong>{entry.value}</strong>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="panel news-section">
            <div className="panel-header">
              <h2>News & funding updates</h2>
              <p>Public transparency feed for patrons and governing bodies</p>
            </div>
            <div className="news-list">
              {news.featuredNews.map((item) => (
                <div key={item.title} className="news-item">
                  <span>{item.type}</span>
                  <strong>{item.title}</strong>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

export default App;
