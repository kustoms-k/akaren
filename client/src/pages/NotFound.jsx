import { Link } from '../components/Link.jsx';

export function NotFound() {
  return (
    <div className="empty">
      <h1 className="t-heading" style={{ marginBottom: 6 }}>Sidan finns inte</h1>
      <Link to="/">Till översikten</Link>
    </div>
  );
}
