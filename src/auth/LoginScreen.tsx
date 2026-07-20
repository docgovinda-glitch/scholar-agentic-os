import React, { useState } from 'react';
import { useAuth } from './authContext';
import { User, Lock } from 'lucide-react';

export default function LoginScreen() {
  const { login, logout, user } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'login' | 'signup'>('login');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await login(username.trim(), password);
    } catch (err: any) {
      setError(err.message || 'Login failed');
    }
  };

  if (user) {
    return (
      <div className="p-4">
        <p className="text-sm">Logged in as {user}</p>
        <button onClick={logout} className="mt-2 px-3 py-1 bg-red-100 text-red-800 rounded">
          Logout
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <form onSubmit={handleLogin} className="bg-white p-6 rounded shadow-lg w-80 space-y-4">
        <h2 className="text-lg font-semibold text-center">Login</h2>
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <div className="flex items-center border rounded p-2">
          <User className="w-4 h-4 text-gray-400 mr-2" />
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={e => setUsername(e.target.value)}
            className="flex-1 outline-none"
            required
          />
        </div>
        <div className="flex items-center border rounded p-2">
          <Lock className="w-4 h-4 text-gray-400 mr-2" />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="flex-1 outline-none"
            required
          />
        </div>
        <button type="submit" className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700">
          Login
        </button>
      </form>
    </div>
  );
}
