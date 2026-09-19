import React from 'react';
import { useAuth } from '../context/AuthContext';

const AccessDenied = () => {
  const { logout } = useAuth();

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-6">
      <div className="max-w-md w-full rounded-2xl border border-amber-200 bg-white p-8 text-center shadow-sm">
        <div className="text-4xl mb-4">🔒</div>
        <h1 className="text-2xl font-black text-slate-800">No access assigned</h1>
        <p className="mt-3 text-sm text-slate-500">
          This account does not currently have permission to open any application module.
          Please contact your administrator.
        </p>
        <button type="button" onClick={logout} className="btn btn-primary mt-6">
          Sign out
        </button>
      </div>
    </div>
  );
};

export default AccessDenied;
