import PoolTable from './components/PoolTable';
import './App.css'; // Ensure this is imported if used, but we'll put everything in index.css or App.css

function App() {
  return (
    <div className="app-container">
      <header className="header">
        <h1 className="title">
          Pool Game
        </h1>
        <p className="subtitle">
          Realistic Canvas Implementation
        </p>
      </header>

      <main className="game-area">
        <PoolTable />
      </main>

      <footer className="footer">
        Use mouse to interact (coming soon)
      </footer>
    </div>
  );
}

export default App;
