import { useEffect, useMemo, useState } from 'react';
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import { getApiUrl } from './config';

const DEFAULT_COORDINATES = [28.6139, 77.209];
const INITIAL_FORM_STATE = {
  location: '',
  lat: '28.6139',
  lng: '77.2090',
  images: []
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
  const [imageAnalysis, setImageAnalysis] = useState(null);
  const [isAnalyzingImage, setIsAnalyzingImage] = useState(false);
  const [imageInputKey, setImageInputKey] = useState(0);
  const severityRank = { High: 3, Medium: 2, Low: 1 };

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

  const analyzeImages = async (images) => {
    if (!images.length) {
      setImageAnalysis(null);
      setStatusMessage('');
      return;
    }

    setImageAnalysis(null);
    setIsAnalyzingImage(true);
    setStatusMessage(`AI is inspecting ${images.length} photo${images.length === 1 ? '' : 's'}…`);

    try {
      const response = await fetch(getApiUrl('/api/analyze-image'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Unable to analyze images');

      setImageAnalysis(result);
      setStatusMessage(`AI detected ${result.category} (${result.confidence}% confidence).`);
    } catch (error) {
      console.error(error);
      setStatusMessage(error.message || 'Unable to analyze images. Please try another photo.');
    } finally {
      setIsAnalyzingImage(false);
    }
  };

  const handleImageChange = async (event) => {
    const selectedFiles = Array.from(event.target.files || []);
    const validFiles = selectedFiles.filter((image) => ['image/jpeg', 'image/png', 'image/webp'].includes(image.type) && image.size <= 5 * 1024 * 1024);

    if (validFiles.length !== selectedFiles.length) {
      setStatusMessage('Only JPG, PNG, or WebP photos smaller than 5 MB can be added.');
    }

    const remainingSlots = 4 - form.images.length;
    const filesToAdd = validFiles.slice(0, remainingSlots);
    if (!filesToAdd.length) {
      if (remainingSlots <= 0) setStatusMessage('You can upload up to 4 issue photos.');
      event.target.value = '';
      return;
    }

    const dataUrls = await Promise.all(filesToAdd.map((image) => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Unable to read the selected photo.'));
      reader.readAsDataURL(image);
      })));
    const nextImages = [...form.images, ...dataUrls];
    setForm((currentForm) => ({ ...currentForm, images: nextImages }));
    setImageInputKey((currentKey) => currentKey + 1);
    await analyzeImages(nextImages);
  };

  const removeSelectedImage = async (index) => {
    const nextImages = form.images.filter((_, imageIndex) => imageIndex !== index);
    setForm((currentForm) => ({ ...currentForm, images: nextImages }));
    await analyzeImages(nextImages);
  };

  const submitIssue = async (event) => {
    event.preventDefault();

    if (!form.images.length) {
      setStatusMessage('Upload at least one photo before submitting the report.');
      return;
    }

    if (!imageAnalysis || isAnalyzingImage) {
      setStatusMessage('Please wait for AI image analysis to finish before submitting.');
      return;
    }

    const payload = {
      location: form.location,
      lat: form.lat,
      lng: form.lng,
      images: form.images
    };

    try {
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
      setImageAnalysis(null);
      setImageInputKey((currentKey) => currentKey + 1);
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
                <h2>Photo-based issue reporting</h2>
                <p>Upload a clear photo and AI will detect the civic issue before you submit it</p>
              </div>
              <form className="report-form" onSubmit={submitIssue}>
                <label className="photo-upload" htmlFor="issue-photo">
                  <span className="upload-icon">⌁</span>
                  <strong>Add issue photos</strong>
                  <small>JPG, PNG, or WebP · up to 4 photos, 5 MB each</small>
                  <input
                    key={imageInputKey}
                    id="issue-photo"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    capture="environment"
                    multiple
                    onChange={handleImageChange}
                  />
                </label>
                {form.images.length ? (
                  <div className="photo-preview-grid">
                    {form.images.map((image, index) => (
                      <div className="selected-photo" key={image}>
                        <img className="photo-preview" src={image} alt={`Selected issue ${index + 1}`} />
                        <button type="button" className="remove-photo-btn" onClick={() => removeSelectedImage(index)} aria-label={`Remove photo ${index + 1}`}>
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
                {isAnalyzingImage ? (
                  <div className="analysis-card analyzing">
                    <div className="mini-spinner"></div>
                    <span>Detecting issue from your image…</span>
                  </div>
                ) : null}
                {imageAnalysis ? (
                  <div className="analysis-card">
                    <span className={`badge ${imageAnalysis.severity.toLowerCase()}`}>{imageAnalysis.severity} severity</span>
                    <div>
                      <strong>{imageAnalysis.category}</strong>
                      <p>{imageAnalysis.summary}</p>
                    </div>
                    <small>Vision AI confidence: {imageAnalysis.confidence}%</small>
                  </div>
                ) : null}
                <div className="inline-fields location-field-row">
                  <input placeholder="Address / Location" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} required />
                  <button type="button" onClick={handleFindOnMap}>Find on Map</button>
                </div>
                <button type="submit" disabled={!imageAnalysis || isAnalyzingImage}>Submit AI-classified report</button>
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
                    {(issue.photoUrls?.length ? issue.photoUrls : issue.photoUrl ? [issue.photoUrl] : []).length ? (
                      <div className="issue-photo-grid">
                        {(issue.photoUrls?.length ? issue.photoUrls : [issue.photoUrl]).map((photoUrl, index) => (
                          <img key={photoUrl} className="issue-photo" src={getApiUrl(photoUrl)} alt={`Reported ${issue.category} ${index + 1}`} />
                        ))}
                      </div>
                    ) : null}
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
