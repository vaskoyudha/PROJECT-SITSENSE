document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('profileSetupForm');
  const nameInput = document.getElementById('displayNameInput');
  const dobInput = document.getElementById('dobInput');
  const saveBtn = document.getElementById('saveProfileBtn');

  if (!window.SitSenseAuth) {
    console.error('Auth module belum siap');
    return;
  }

  window.SitSenseAuth.requireAuth({ redirectTo: '/auth/masuk.html' });

  const cachedProfile = window.SitSenseAuth.getProfile();
  if (cachedProfile?.displayName) {
    nameInput.value = cachedProfile.displayName;
  }
  if (cachedProfile?.dateOfBirth) {
    dobInput.value = cachedProfile.dateOfBirth;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const displayName = nameInput.value.trim();
    const dateOfBirth = dobInput.value;

    if (!displayName) {
      alert('Nama tidak boleh kosong.');
      return;
    }
    if (!dateOfBirth) {
      alert('Tanggal lahir wajib diisi.');
      return;
    }

    const dobDate = new Date(dateOfBirth);
    if (dobDate > new Date()) {
      alert('Tanggal lahir tidak valid.');
      return;
    }

    saveBtn.disabled = true;
    saveBtn.classList.add('loading');
    try {
      const result = await window.SitSenseAuth.completeProfile({ displayName, dateOfBirth });
      if (!result.ok) {
        alert(result.message || 'Gagal menyimpan profil.');
        return;
      }
      window.location.href = '/profile.html';
    } catch (err) {
      alert(err?.message || 'Gagal menyimpan profil.');
    } finally {
      saveBtn.disabled = false;
      saveBtn.classList.remove('loading');
    }
  });
});
