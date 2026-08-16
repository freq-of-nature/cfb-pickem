'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import NavBar from '@/components/NavBar';
import { supabase } from '@/lib/supabase';
import { SchoolColor } from '@/types';

export default function SettingsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [schools, setSchools] = useState<SchoolColor[]>([]);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => {
    if (!loading && !user) {
      router.push('/');
    }
  }, [loading, user, router]);

  useEffect(() => {
    const fetchSchools = async () => {
      const { data } = await supabase
        .from('school_colors')
        .select('*')
        .order('conference', { ascending: true })
        .order('display_name', { ascending: true });
      if (data) setSchools(data);
    };
    fetchSchools();
  }, []);

  useEffect(() => {
    if (user?.school_slug) {
      setSelectedSlug(user.school_slug);
    }
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    setStatus('');

    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id, schoolSlug: selectedSlug }),
    });
    const data = await res.json();

    if (data.success) {
      // Update local session
      const session = JSON.parse(localStorage.getItem('cfb_session') || '{}');
      if (session.user) {
        session.user.school_slug = selectedSlug;
        localStorage.setItem('cfb_session', JSON.stringify(session));
      }
      setStatus('Saved!');
    } else {
      setStatus(`Error: ${data.error}`);
    }
    setSaving(false);
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><div className="text-gray-400">Loading...</div></div>;
  }

  if (!user) return null;

  const conferences = ['SEC', 'Big Ten', 'Big 12', 'ACC'];
  const selectedSchool = schools.find(s => s.slug === selectedSlug);

  return (
    <>
      <NavBar />
      <main className="max-w-lg mx-auto px-4 py-6 pb-24">
        <h1 className="text-2xl font-bold mb-6">Settings</h1>

        {/* Preview */}
        {selectedSchool && (
          <div
            className="rounded-xl p-4 mb-6 border-2 transition-all"
            style={{
              borderColor: selectedSchool.primary_color,
              backgroundColor: `${selectedSchool.primary_color}15`,
            }}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold"
                style={{
                  backgroundColor: selectedSchool.primary_color,
                  color: selectedSchool.secondary_color,
                }}
              >
                {user.first_name.charAt(0)}
              </div>
              <div>
                <div className="text-white font-semibold">{user.first_name} {user.last_name}</div>
                <div className="text-sm" style={{ color: selectedSchool.primary_color }}>
                  {selectedSchool.display_name}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* School Picker */}
        <div className="space-y-4">
          {conferences.map(conf => {
            const confSchools = schools.filter(s => s.conference === conf);
            if (confSchools.length === 0) return null;

            return (
              <div key={conf} className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
                <div className="px-4 py-2.5 bg-gray-800/50 border-b border-gray-800">
                  <h2 className="text-sm font-semibold text-gray-400">{conf}</h2>
                </div>
                <div className="grid grid-cols-2 gap-px bg-gray-800">
                  {confSchools.map(school => {
                    const isSelected = selectedSlug === school.slug;
                    return (
                      <button
                        key={school.slug}
                        onClick={() => setSelectedSlug(isSelected ? null : school.slug)}
                        className={`flex items-center gap-2 px-3 py-2.5 transition-colors text-left ${
                          isSelected ? 'bg-gray-800' : 'bg-gray-900 hover:bg-gray-850'
                        }`}
                        style={isSelected ? {
                          backgroundColor: `${school.primary_color}20`,
                          borderLeft: `3px solid ${school.primary_color}`,
                        } : {}}
                      >
                        <div
                          className="w-4 h-4 rounded-full flex-shrink-0 border"
                          style={{
                            backgroundColor: school.primary_color,
                            borderColor: school.secondary_color,
                          }}
                        />
                        <span className={`text-xs truncate ${isSelected ? 'text-white font-medium' : 'text-gray-300'}`}>
                          {school.display_name.replace(/\s+(Crimson Tide|Razorbacks|Tigers|Gators|Bulldogs|Wildcats|Rebels|Gamecocks|Volunteers|Longhorns|Aggies|Commodores|Fighting Illini|Hoosiers|Hawkeyes|Terrapins|Wolverines|Spartans|Golden Gophers|Cornhuskers|Buckeyes|Ducks|Nittany Lions|Boilermakers|Scarlet Knights|Trojans|Bruins|Huskies|Badgers|Sun Devils|Bears|Cougars|Bearcats|Buffaloes|Cyclones|Jayhawks|Cowboys|Horned Frogs|Red Raiders|Knights|Utes|Mountaineers|Eagles|Golden Bears|Blue Devils|Seminoles|Yellow Jackets|Cardinals|Hurricanes|Wolfpack|Tar Heels|Panthers|Mustangs|Cardinal|Orange|Cavaliers|Hokies|Demon Deacons)$/i, '')}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Save Button */}
        <div className="sticky bottom-4 mt-6">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-3 bg-white text-gray-900 font-semibold rounded-xl hover:bg-gray-200 transition-colors disabled:opacity-50 shadow-lg"
          >
            {saving ? 'Saving...' : 'Save Theme'}
          </button>
          {status && (
            <div className={`text-center text-sm mt-2 ${status.startsWith('Error') ? 'text-red-400' : 'text-green-400'}`}>
              {status}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
