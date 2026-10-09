import React, { useEffect, useState } from 'react';
import { syncManager, SyncStatus } from '../../services/offline/syncManager';
import { CloudOff, CloudUpload, CheckCircle2, AlertCircle } from 'lucide-react';

export default function SyncToast() {
  const [status, setStatus] = useState<SyncStatus>('online');
  const [pending, setPending] = useState(0);
  const [showToast, setShowToast] = useState(false);
  const [lastSynced, setLastSynced] = useState<{count: number} | null>(null);

  useEffect(() => {
    let wasOfflineOrSyncing = false;
    let prevPending = 0;
    
    return syncManager.subscribe((newStatus, newPending) => {
      setStatus(newStatus);
      setPending(newPending);
      
      if (newStatus === 'offline' || newStatus === 'syncing') {
        if (newPending > 0) {
          wasOfflineOrSyncing = true;
        }
      }
      
      if (newStatus === 'synced' && wasOfflineOrSyncing && newPending === 0 && prevPending > 0) {
        setLastSynced({ count: prevPending });
        setShowToast(true);
        wasOfflineOrSyncing = false;
        setTimeout(() => setShowToast(false), 5000);
      }
      
      prevPending = newPending;
    });
  }, []);

  if (status === 'offline' && pending > 0) {
    return (
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 text-amber-800 dark:text-amber-200 px-4 py-2.5 rounded-full shadow-lg flex items-center gap-2 text-xs sm:text-sm animate-in fade-in slide-in-from-bottom-4 transition-all duration-300">
        <CloudOff className="w-4 h-4" />
        <span className="font-medium">Offline · {pending} pending edit{pending > 1 ? 's' : ''}</span>
      </div>
    );
  }

  if (status === 'syncing' && pending > 0) {
    return (
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/20 text-indigo-800 dark:text-indigo-200 px-4 py-2.5 rounded-full shadow-lg flex items-center gap-2 text-xs sm:text-sm animate-in fade-in slide-in-from-bottom-4 transition-all duration-300">
        <CloudUpload className="w-4 h-4 animate-bounce" />
        <span className="font-medium">Syncing {pending} edit{pending > 1 ? 's' : ''}...</span>
      </div>
    );
  }
  
  if (showToast && lastSynced) {
    return (
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-800 dark:text-emerald-200 px-4 py-2.5 rounded-full shadow-lg flex items-center gap-2 text-xs sm:text-sm animate-in fade-in slide-in-from-bottom-4 transition-all duration-300">
        <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
        <span className="font-medium">Safely merged {lastSynced.count} offline edit{lastSynced.count > 1 ? 's' : ''}.</span>
      </div>
    );
  }

  if (status === 'error' && pending > 0) {
     return (
       <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 text-rose-800 dark:text-rose-200 px-4 py-2.5 rounded-full shadow-lg flex items-center gap-2 text-xs sm:text-sm animate-in fade-in slide-in-from-bottom-4 transition-all duration-300">
         <AlertCircle className="w-4 h-4" />
         <span className="font-medium">Sync failed. {pending} pending edit{pending > 1 ? 's' : ''} saved locally.</span>
       </div>
     );
  }

  return null;
}
