'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function ProfilePage() {
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail] = useState('');
  const [createdAt, setCreatedAt] = useState('');
  const [deckCount, setDeckCount] = useState(0);

  // Password form
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordMsg, setPasswordMsg] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [passwordLoading, setPasswordLoading] = useState(false);

  // Delete account
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    async function loadProfile() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }
      setEmail(user.email ?? '');
      setCreatedAt(
        new Date(user.created_at).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })
      );

      // Fetch deck count
      const { count } = await supabase
        .from('decks')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id);
      setDeckCount(count ?? 0);
    }
    loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMsg(null);

    if (newPassword !== confirmPassword) {
      setPasswordMsg({ type: 'error', text: 'New passwords do not match.' });
      return;
    }
    if (newPassword.length < 8) {
      setPasswordMsg({
        type: 'error',
        text: 'Password must be at least 8 characters.',
      });
      return;
    }

    setPasswordLoading(true);

    // Verify current password by re-signing in
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password: currentPassword,
    });

    if (signInError) {
      setPasswordMsg({
        type: 'error',
        text: 'Current password is incorrect.',
      });
      setPasswordLoading(false);
      return;
    }

    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) {
      setPasswordMsg({ type: 'error', text: error.message });
    } else {
      setPasswordMsg({
        type: 'success',
        text: 'Password updated successfully.',
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    }
    setPasswordLoading(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const handleDeleteAccount = async () => {
    setDeleteLoading(true);
    // Call an API route to delete the account (requires admin/service key)
    const res = await fetch('/api/account', { method: 'DELETE' });
    if (res.ok) {
      await supabase.auth.signOut();
      router.push('/login');
    } else {
      setDeleteLoading(false);
      setShowDeleteConfirm(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="text-2xl font-bold text-font-primary">Profile</h1>

      {/* User Info */}
      <section className="rounded-xl border border-border bg-bg-surface p-5">
        <h2 className="mb-4 text-lg font-semibold text-font-primary">
          Account Info
        </h2>
        <div className="space-y-3">
          <div>
            <span className="text-sm text-font-secondary">Email</span>
            <p className="text-font-primary">{email}</p>
          </div>
          <div>
            <span className="text-sm text-font-secondary">Member since</span>
            <p className="text-font-primary">{createdAt}</p>
          </div>
          <div>
            <span className="text-sm text-font-secondary">Decks created</span>
            <p className="text-font-primary">{deckCount}</p>
          </div>
        </div>
      </section>

      {/* Change Password */}
      <section className="rounded-xl border border-border bg-bg-surface p-5">
        <h2 className="mb-4 text-lg font-semibold text-font-primary">
          Change Password
        </h2>
        <form onSubmit={handleChangePassword} className="space-y-3">
          <div>
            <label className="mb-1 block text-sm text-font-secondary">
              Current password
            </label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              className="w-full rounded-lg border border-border bg-bg-card px-3 py-2 text-font-primary placeholder:text-font-muted focus:border-bg-accent focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-font-secondary">
              New password
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
              className="w-full rounded-lg border border-border bg-bg-card px-3 py-2 text-font-primary placeholder:text-font-muted focus:border-bg-accent focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-font-secondary">
              Confirm new password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
              className="w-full rounded-lg border border-border bg-bg-card px-3 py-2 text-font-primary placeholder:text-font-muted focus:border-bg-accent focus:outline-none"
            />
          </div>
          {passwordMsg && (
            <p
              className={`text-sm ${
                passwordMsg.type === 'error'
                  ? 'text-bg-red'
                  : 'text-bg-green'
              }`}
            >
              {passwordMsg.text}
            </p>
          )}
          <button
            type="submit"
            disabled={passwordLoading}
            className="w-full rounded-lg bg-bg-accent px-4 py-2.5 text-sm font-medium text-font-white transition-colors hover:bg-bg-accent-dark disabled:opacity-50"
          >
            {passwordLoading ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      </section>

      {/* Actions */}
      <section className="space-y-3">
        <button
          onClick={handleLogout}
          className="w-full rounded-xl border border-border bg-bg-surface px-4 py-3 text-sm font-medium text-font-primary transition-colors hover:bg-bg-hover"
        >
          Log Out
        </button>

        {!showDeleteConfirm ? (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="w-full rounded-xl border border-bg-red/30 bg-bg-surface px-4 py-3 text-sm font-medium text-bg-red transition-colors hover:bg-bg-red/10"
          >
            Delete Account
          </button>
        ) : (
          <div className="rounded-xl border border-bg-red/30 bg-bg-surface p-4">
            <p className="mb-3 text-sm text-font-primary">
              Are you sure? This will permanently delete your account and all
              your data. This action cannot be undone.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 rounded-lg border border-border px-3 py-2 text-sm text-font-secondary transition-colors hover:bg-bg-hover"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={deleteLoading}
                className="flex-1 rounded-lg bg-bg-red px-3 py-2 text-sm font-medium text-font-white transition-colors hover:bg-bg-red/80 disabled:opacity-50"
              >
                {deleteLoading ? 'Deleting...' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
