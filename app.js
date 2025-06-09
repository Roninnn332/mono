const SUPABASE_URL = 'https://haiheidbydaiapizrrjh.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhhaWhlaWRieWRhaWFwaXpycmpoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDkzMDMwOTgsImV4cCI6MjA2NDg3OTA5OH0.AwJTbpGKdiNh5waTGQX_dpfpSdDsbVJsm2fk1XSRERI';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const CLOUDINARY_URL = 'https://api.cloudinary.com/v1_1/dd6wrgime/image/upload';
const CLOUDINARY_UPLOAD_PRESET = 'server_profiles';
const CLOUDINARY_FOLDER = 'serverimages';

let uploadedServerIconUrl = null;
let cropper = null;

// Track the currently open DM friend globally
let currentOpenDMFriendId = null;

// Track rendered DM message IDs per friend
const renderedDMMessageIds = {};

// Cache for user info (avatar, username) by user ID
const dmUserCache = {};

// Track the currently selected channel globally
let selectedChannelId = null;

// Cache for user info (avatar, username) by user ID for channels
const channelUserCache = {};

// Live channel message subscription
let channelRealtimeSubscription = null;

// Track the currently subscribed channel for realtime
let currentRealtimeChannelId = null;

// At the top-level (global):
let voiceSubscription = null;
let currentVoiceChannelSubId = null;

let heartbeatInterval = null;

let voiceChannelName = null;
let isVoiceSubscribed = false;

// Add UUID validation helper at top-level
function isValidUUID(uuid) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid);
}

// Add global to track last selected channel and server name
let lastSelectedChannel = null;
let lastSelectedServerName = null;

document.addEventListener('DOMContentLoaded', function() {
  // Global error handler for unhandled promise rejections
  window.addEventListener('unhandledrejection', function(event) {
    if (event.reason && event.reason.message) {
      console.error('Global Unhandled Promise Rejection:', event.reason.message, event.reason);
    } else {
      console.error('Global Unhandled Promise Rejection:', event);
    }
  });

  const addServerBtn = document.querySelector('.add-server');
  const modalOverlay = document.getElementById('modal-overlay');
  const modalCancel = document.getElementById('modal-cancel');
  const modal = document.querySelector('.modal');

  // Open modal
  addServerBtn.addEventListener('click', () => {
    modalOverlay.style.display = 'flex';
    setTimeout(() => {
      modalOverlay.classList.add('active');
    }, 10);
  });

  // Close modal on cancel
  modalCancel.addEventListener('click', () => {
    modalOverlay.style.display = 'none';
    modalOverlay.classList.remove('active');
  });

  // Close modal when clicking outside modal content
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) {
      modalOverlay.style.display = 'none';
      modalOverlay.classList.remove('active');
    }
  });

  // Prevent modal close when clicking inside modal
  modal.addEventListener('click', (e) => {
    e.stopPropagation();
  });

  // Image upload logic
  const serverIconInput = document.getElementById('server-icon-input');
  const imgUploadCircle = document.querySelector('.img-upload-circle');
  const cropperPreview = document.getElementById('cropper-preview');
  let cropButton = null;

  serverIconInput.addEventListener('change', function() {
    const file = this.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
      cropperPreview.src = e.target.result;
      cropperPreview.style.display = 'block';
      imgUploadCircle.style.display = 'none';
      if (cropper) cropper.destroy();
      cropper = new Cropper(cropperPreview, {
        aspectRatio: 1,
        viewMode: 1,
        dragMode: 'move',
        background: false,
        autoCropArea: 1,
        responsive: true,
        guides: false,
        movable: true,
        zoomable: true,
        rotatable: false,
        scalable: false,
        cropBoxResizable: true,
        minCropBoxWidth: 80,
        minCropBoxHeight: 80
      });
      if (!cropButton) {
        cropButton = document.createElement('button');
        cropButton.textContent = 'Crop & Upload';
        cropButton.className = 'primary';
        cropButton.style.marginTop = '10px';
        cropperPreview.parentNode.appendChild(cropButton);
        cropButton.addEventListener('click', async function() {
          const canvas = cropper.getCroppedCanvas({ width: 120, height: 120, imageSmoothingQuality: 'high' });
          canvas.toBlob(async function(blob) {
            const formData = new FormData();
            formData.append('file', blob, 'servericon.png');
            formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
            formData.append('folder', CLOUDINARY_FOLDER);
            try {
              cropButton.disabled = true;
              cropButton.textContent = 'Uploading...';
              const res = await fetch(CLOUDINARY_URL, {
                method: 'POST',
                body: formData
              });
              const data = await res.json();
              if (data.secure_url) {
                uploadedServerIconUrl = data.secure_url;
                cropperPreview.style.display = 'none';
                imgUploadCircle.style.display = 'block';
                imgUploadCircle.style.backgroundImage = `url('${uploadedServerIconUrl}')`;
                imgUploadCircle.style.backgroundSize = 'cover';
                imgUploadCircle.style.backgroundPosition = 'center';
                cropper.destroy();
                cropper = null;
                cropButton.remove();
                cropButton = null;
              } else {
                alert('Image upload failed.');
                cropButton.disabled = false;
                cropButton.textContent = 'Crop & Upload';
              }
            } catch (e) {
              alert('Image upload error.');
              cropButton.disabled = false;
              cropButton.textContent = 'Crop & Upload';
            }
          }, 'image/png');
        });
      }
    };
    reader.readAsDataURL(file);
  });

  const serversSidebar = document.querySelector('.servers');
  const modalMessage = document.getElementById('modal-message');

  function showSuccessTick(message) {
    modalMessage.innerHTML = `
      <span class="success-tick">
        <svg viewBox="0 0 32 32">
          <path class="tick" d="M8 18 L14 24 L24 10" />
        </svg>
      </span>
      <span>${message}</span>
    `;
  }
  function showErrorMessage(message) {
    modalMessage.innerHTML = `<span style='color:#e74c3c;'>${message}</span>`;
  }
  function clearModalMessage() {
    modalMessage.innerHTML = '';
  }

  document.getElementById('modal-create').addEventListener('click', async () => {
    const name = document.getElementById('server-name').value.trim();
    if (!name) {
      showErrorMessage('Please enter a server name.');
      return;
    }
    const currentUser = getUserSession();
    const { data, error } = await supabase
      .from('servers')
      .insert([{ name, icon_url: uploadedServerIconUrl, owner_id: currentUser.id }])
      .select();
    if (error) {
      showErrorMessage('Error creating server: ' + error.message);
    } else {
      showSuccessTick('Server created!');
      if (data && data[0]) {
        // Add owner as a member
        await supabase.from('server_members').insert([
          {
            server_id: data[0].id,
            user_id: currentUser.id,
            role: 'owner'
          }
        ]);
        // Create default welcome channel
        await supabase.from('channels').insert([
          {
            name: 'welcome',
            type: 'text',
            server_id: data[0].id,
            is_private: false,
            creator_id: currentUser.id
          }
        ]);
        // REMOVE: code that creates and inserts a server button here
        // Instead, just let loadServers() handle rendering
      }
      setTimeout(() => {
        document.getElementById('modal-overlay').style.display = 'none';
        document.getElementById('server-name').value = '';
        uploadedServerIconUrl = null;
        imgUploadCircle.style.backgroundImage = '';
        imgUploadCircle.style.display = 'block';
        cropperPreview.style.display = 'none';
        clearModalMessage();
        // Optionally reload servers to reflect the new one
        loadServers();
      }, 1200);
    }
  });

  const createChannelBtn = document.querySelector('.create-channel-btn');
  // Hide by default
  createChannelBtn.style.display = 'none';

  // Helper to show/hide create channel button
  async function updateCreateChannelBtn(serverId) {
    if (!serverId) {
      createChannelBtn.style.display = 'none';
      return;
    }
    const currentUser = getUserSession();
    // Fetch owner_id for this server
    const { data, error } = await supabase
      .from('servers')
      .select('owner_id')
      .eq('id', serverId)
      .maybeSingle();
    if (data && data.owner_id === currentUser.id) {
      createChannelBtn.style.display = '';
    } else {
      createChannelBtn.style.display = 'none';
    }
  }

  // Add click event to server buttons after loading servers
  async function loadServers() {
    document.querySelectorAll('.servers .server-btn').forEach(btn => btn.remove());
    const currentUser = getUserSession();
    const { data, error } = await supabase
      .from('server_members')
      .select('server_id, servers(id, name, icon_url)')
      .eq('user_id', currentUser.id);
    if (data && Array.isArray(data)) {
      data.forEach(member => {
        const server = member.servers;
        if (!server) return;
        const btn = document.createElement('button');
        btn.className = 'icon-btn server-btn';
        btn.title = server.name;
        btn.style.background = '#36393f';
        btn.style.marginBottom = '12px';
        if (server.icon_url) {
          btn.style.backgroundImage = `url('${server.icon_url}')`;
          btn.style.backgroundSize = 'cover';
          btn.style.backgroundPosition = 'center';
        } else {
          btn.textContent = server.name[0].toUpperCase();
        }
        btn.addEventListener('click', async () => {
          setSelectedServer(server.id);
          await updateCreateChannelBtn(server.id);
        });
        document.querySelector('.servers').insertBefore(btn, document.querySelector('.server-separator'));
      });
    }
    updateCreateChannelBtn(null);
    return data;
  }

  // AUTH LOGIC (custom, display name + password)
  const authOverlay = document.getElementById('auth-overlay');
  const authForm = document.getElementById('auth-form');
  const authTitle = document.getElementById('auth-title');
  const authSubmit = document.getElementById('auth-submit');
  const authToggleText = document.getElementById('auth-toggle-text');
  const authToggleLink = document.getElementById('auth-toggle-link');
  const authMessage = document.getElementById('auth-message');
  const authModal = document.querySelector('.auth-modal');
  let isLogin = true;

  function setUserSession(user) {
    localStorage.setItem('user', JSON.stringify(user));
  }
  function getUserSession() {
    try {
      return JSON.parse(localStorage.getItem('user'));
    } catch {
      return null;
    }
  }
  function clearUserSession() {
    localStorage.removeItem('user');
  }

  async function checkAuth() {
    const user = getUserSession();
    if (user && user.id && user.displayname) {
      authOverlay.style.display = 'none';
      document.querySelector('.container').style.display = '';
      loadServers();
    } else {
      authOverlay.style.display = 'flex';
      document.querySelector('.container').style.display = 'none';
    }
  }

  checkAuth();

  const confirmLabel = document.getElementById('confirm-label');
  const confirmPasswordInput = document.getElementById('auth-confirm-password');
  const displayNameInput = document.getElementById('auth-displayname');

  authToggleLink.addEventListener('click', (e) => {
    e.preventDefault();
    isLogin = !isLogin;
    authModal.classList.add('switching');
    setTimeout(() => {
      if (isLogin) {
        authTitle.textContent = 'Login';
        authSubmit.textContent = 'Login';
        authToggleText.textContent = "Don't have an account?";
        authToggleLink.textContent = 'Sign up';
        confirmLabel.style.display = 'none';
        confirmPasswordInput.style.display = 'none';
        confirmPasswordInput.required = false;
      } else {
        authTitle.textContent = 'Sign Up';
        authSubmit.textContent = 'Sign Up';
        authToggleText.textContent = 'Already have an account?';
        authToggleLink.textContent = 'Login';
        confirmLabel.style.display = 'block';
        confirmPasswordInput.style.display = 'block';
        confirmPasswordInput.required = true;
      }
      authMessage.textContent = '';
      authModal.classList.remove('switching');
      displayNameInput.focus();
    }, 250);
  });

  authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const displayname = displayNameInput.value.trim();
    const password = document.getElementById('auth-password').value;
    const confirmPassword = confirmPasswordInput.value;
    authMessage.textContent = '';
    if (!displayname || !password || (!isLogin && !confirmPassword)) {
      authMessage.textContent = 'Please fill all fields.';
      return;
    }
    if (!isLogin && password !== confirmPassword) {
      authMessage.textContent = 'Passwords do not match.';
      return;
    }
    if (isLogin) {
      // Login: check users table
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('username', displayname)
        .eq('password', password)
        .maybeSingle();
      if (error || !data) {
        authMessage.textContent = 'Invalid display name or password.';
      } else {
        setUserSession({ id: data.id, displayname: data.username });
        authMessage.style.color = '#43b581';
        authMessage.textContent = 'Login successful!';
        setTimeout(() => checkAuth(), 600);
      }
    } else {
      // Signup: check if display name exists
      const { data: exists } = await supabase
        .from('users')
        .select('id')
        .eq('username', displayname)
        .maybeSingle();
      if (exists) {
        authMessage.textContent = 'Display name already taken.';
        return;
      }
      // Generate unique friend code
      const friend_code = await generateUniqueFriendCode();
      // Insert new user
      const { data, error } = await supabase
        .from('users')
        .insert([{ username: displayname, password, friend_code }])
        .select()
        .maybeSingle();
      if (error || !data) {
        authMessage.textContent = 'Signup failed.';
      } else {
        setUserSession({ id: data.id, displayname: data.username });
        authMessage.style.color = '#43b581';
        authMessage.textContent = 'Signup successful!';
        setTimeout(() => checkAuth(), 600);
      }
    }
  });

  // --- PROFILE MODAL LOGIC ---
  const profileModal = document.getElementById('profile-modal');
  const profileClose = document.getElementById('profile-close');
  const profileBanner = document.getElementById('profile-banner');
  const profileBannerUpload = document.getElementById('profile-banner-upload');
  const profileBannerInput = document.getElementById('profile-banner-input');
  const profileAvatar = document.getElementById('profile-avatar');
  const profileAvatarUpload = document.getElementById('profile-avatar-upload');
  const profileAvatarInput = document.getElementById('profile-avatar-input');
  const profileDisplayName = document.getElementById('profile-displayname');
  const profileEditDisplayName = document.getElementById('profile-edit-displayname');
  const profileDisplayNameInput = document.getElementById('profile-displayname-input');
  const profileSaveDisplayName = document.getElementById('profile-save-displayname');
  const profileAboutInput = document.getElementById('profile-about-input');
  const profileDeleteAccount = document.getElementById('profile-delete-account');
  const cropperModal = document.getElementById('cropper-modal');
  const cropperImage = document.getElementById('cropper-image');
  const cropperTitle = document.getElementById('cropper-title');
  const cropperCancel = document.getElementById('cropper-cancel');
  const cropperSave = document.getElementById('cropper-save');
  const profileFriendCode = document.getElementById('profile-friendcode');
  const copyFriendCodeBtn = document.getElementById('copy-friendcode-btn');

  let cropperType = null; // 'avatar' or 'banner'
  let cropperInstance = null;
  let currentUser = getUserSession();

  // Helper to generate a unique 6-digit friend code
  async function generateUniqueFriendCode() {
    let code, exists;
    do {
      code = String(Math.floor(100000 + Math.random() * 900000));
      // Check if code exists
      const { data } = await supabase.from('users').select('id').eq('friend_code', code).maybeSingle();
      exists = !!data;
    } while (exists);
    return code;
  }

  // Open profile modal (add your trigger, e.g. user icon click)
  window.openProfileModal = async function() {
    currentUser = getUserSession();
    if (!currentUser) return;
    // Fetch user data from Supabase
    const { data, error } = await supabase.from('users').select('*').eq('id', currentUser.id).maybeSingle();
    if (data) {
      profileAvatar.src = data.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(data.username)}`;
      profileBanner.style.backgroundImage = data.banner_url ? `url('${data.banner_url}')` : "";
      profileDisplayName.textContent = data.username;
      profileDisplayNameInput.value = data.username;
      profileAboutInput.value = data.about_me || '';
      profileFriendCode.textContent = '#' + (data.friend_code || '------');
      copyFriendCodeBtn.onclick = function() {
        if (data.friend_code) {
          navigator.clipboard.writeText(data.friend_code);
          copyFriendCodeBtn.innerHTML = '<i class="fa fa-check"></i>';
          setTimeout(() => copyFriendCodeBtn.innerHTML = '<i class="fa fa-copy"></i>', 1200);
        }
      };
    }
    profileModal.style.display = 'flex';
    setTimeout(() => profileModal.classList.add('active'), 10);
  };

  // Close profile modal
  profileClose.addEventListener('click', () => {
    profileModal.classList.remove('active');
    setTimeout(() => profileModal.style.display = 'none', 200);
  });
  profileModal.addEventListener('click', (e) => {
    if (e.target === profileModal) {
      profileModal.classList.remove('active');
      setTimeout(() => profileModal.style.display = 'none', 200);
    }
  });
  document.querySelector('.profile-card').addEventListener('click', e => e.stopPropagation());

  // --- Avatar/Banner Upload & Crop ---
  function openCropper(type, file) {
    cropperType = type;
    cropperTitle.textContent = type === 'avatar' ? 'Crop Avatar' : 'Crop Banner';
    cropperModal.style.display = 'flex';
    setTimeout(() => cropperModal.classList.add('active'), 10);
    document.getElementById('profile-modal').classList.add('modal-blur');
    if (cropperInstance) cropperInstance.destroy(); cropperInstance = null;
    cropperImage.src = '';
    cropperImage.style.display = 'block';
    cropperImage.style.background = '#222'; // for debug
    cropperImage.style.border = '2px solid #4a90e2'; // for debug
    if (!file || !file.type.startsWith('image/')) {
      alert('Please select a valid image file.');
      return;
    }
    const reader = new FileReader();
    reader.onload = function(e) {
      cropperImage.onload = function() {
        cropperImage.onerror = null; // clear error handler
        try {
          if (cropperInstance) cropperInstance.destroy();
          cropperInstance = new Cropper(cropperImage, {
            aspectRatio: type === 'avatar' ? 1 : 3.5,
            viewMode: 1,
            dragMode: 'move',
            background: false,
            autoCropArea: 1,
            responsive: true,
            guides: false,
            movable: true,
            zoomable: true,
            rotatable: false,
            scalable: false,
            cropBoxResizable: true,
            minCropBoxWidth: 80,
            minCropBoxHeight: 80
          });
          console.log('Cropper initialized for', type);
        } catch (err) {
          alert('Error initializing cropper: ' + err);
        }
      };
      cropperImage.onerror = function() {
        cropperImage.onload = null; // clear load handler
        console.error('Cropper image failed to load');
        alert('Failed to load image for cropping.');
      };
      cropperImage.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }
  function closeCropper() {
    cropperModal.classList.remove('active');
    setTimeout(() => cropperModal.style.display = 'none', 200);
    if (cropperInstance) { cropperInstance.destroy(); cropperInstance = null; }
    cropperImage.src = '';
    document.getElementById('profile-modal').classList.remove('modal-blur');
  }
  cropperCancel.addEventListener('click', closeCropper);
  cropperModal.addEventListener('click', (e) => { if (e.target === cropperModal) closeCropper(); });
  document.querySelector('.cropper-card').addEventListener('click', e => e.stopPropagation());

  // Avatar upload
  profileAvatarUpload.addEventListener('click', () => profileAvatarInput.click());
  profileAvatarInput.addEventListener('change', function() {
    const file = this.files[0];
    if (file) openCropper('avatar', file);
  });
  // Banner upload
  profileBannerUpload.addEventListener('click', () => profileBannerInput.click());
  profileBannerInput.addEventListener('change', function() {
    const file = this.files[0];
    if (file) openCropper('banner', file);
  });

  cropperSave.addEventListener('click', async function() {
    if (!cropperInstance) return;
    let canvas, uploadWidth, uploadHeight;
    if (cropperType === 'avatar') {
      uploadWidth = uploadHeight = 200;
      canvas = cropperInstance.getCroppedCanvas({ width: uploadWidth, height: uploadHeight, imageSmoothingQuality: 'high' });
    } else {
      uploadWidth = 700; uploadHeight = 200;
      canvas = cropperInstance.getCroppedCanvas({ width: uploadWidth, height: uploadHeight, imageSmoothingQuality: 'high' });
    }
    canvas.toBlob(async function(blob) {
      const formData = new FormData();
      formData.append('file', blob, cropperType + '.png');
      formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
      formData.append('folder', CLOUDINARY_FOLDER);
      try {
        cropperSave.disabled = true;
        cropperSave.textContent = 'Uploading...';
        const res = await fetch(CLOUDINARY_URL, { method: 'POST', body: formData });
        const data = await res.json();
        if (data.secure_url) {
          if (cropperType === 'avatar') {
            await supabase.from('users').update({ avatar_url: data.secure_url }).eq('id', currentUser.id);
            profileAvatar.src = data.secure_url;
          } else {
            await supabase.from('users').update({ banner_url: data.secure_url }).eq('id', currentUser.id);
            profileBanner.style.backgroundImage = `url('${data.secure_url}')`;
          }
          closeCropper();
        } else {
          alert('Image upload failed.');
        }
      } catch (e) {
        alert('Image upload error.');
      } finally {
        cropperSave.disabled = false;
        cropperSave.textContent = 'Save';
      }
    }, 'image/png');
  });

  // --- Display Name Edit ---
  profileEditDisplayName.addEventListener('click', () => {
    profileDisplayNameInput.value = profileDisplayName.textContent;
    profileDisplayName.style.display = 'none';
    profileEditDisplayName.style.display = 'none';
    profileDisplayNameInput.style.display = 'inline-block';
    profileSaveDisplayName.style.display = 'inline-block';
    profileDisplayNameInput.focus();
  });
  profileSaveDisplayName.addEventListener('click', async () => {
    const newName = profileDisplayNameInput.value.trim();
    if (!newName) return;
    await supabase.from('users').update({ username: newName }).eq('id', currentUser.id);
    profileDisplayName.textContent = newName;
    profileDisplayName.style.display = '';
    profileEditDisplayName.style.display = '';
    profileDisplayNameInput.style.display = 'none';
    profileSaveDisplayName.style.display = 'none';
    // Update session
    setUserSession({ ...currentUser, displayname: newName });
  });
  profileDisplayNameInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') profileSaveDisplayName.click();
    if (e.key === 'Escape') {
      profileDisplayName.style.display = '';
      profileEditDisplayName.style.display = '';
      profileDisplayNameInput.style.display = 'none';
      profileSaveDisplayName.style.display = 'none';
    }
  });

  // --- About Me Edit ---
  profileAboutInput.addEventListener('change', async () => {
    await supabase.from('users').update({ about_me: profileAboutInput.value }).eq('id', currentUser.id);
  });

  // --- Delete Account ---
  profileDeleteAccount.addEventListener('click', async () => {
    if (!confirm('Are you sure? This cannot be undone.')) return;
    await supabase.from('users').delete().eq('id', currentUser.id);
    clearUserSession();
    window.location.reload();
  });

  // Example: attach to user icon
  const userIcon = document.querySelector('.user-icon');
  if (userIcon) userIcon.addEventListener('click', openProfileModal);

  // --- CREATE CHANNEL MODAL LOGIC ---
  let selectedServerId = null;
  const createChannelModal = document.getElementById('create-channel-modal');
  const createChannelClose = document.getElementById('create-channel-close');
  const createChannelCancel = document.getElementById('create-channel-cancel');
  const createChannelSubmit = document.getElementById('create-channel-submit');
  const channelTypeText = document.getElementById('channel-type-text');
  const channelTypeVoice = document.getElementById('channel-type-voice');
  const channelNameInput = document.getElementById('channel-name');
  const privateChannelToggle = document.getElementById('private-channel-toggle');
  const channelsPanel = document.querySelector('.channels');
  let selectedChannelType = 'text';

  // Open modal
  createChannelBtn.addEventListener('click', () => {
    if (!selectedServerId) return;
    createChannelModal.style.display = 'flex';
    setTimeout(() => createChannelModal.classList.add('active'), 10);
    channelNameInput.value = '';
    privateChannelToggle.checked = false;
    setChannelType('text');
  });
  // Close modal
  function closeCreateChannelModal() {
    createChannelModal.classList.remove('active');
    setTimeout(() => createChannelModal.style.display = 'none', 200);
  }
  createChannelClose.addEventListener('click', closeCreateChannelModal);
  createChannelCancel.addEventListener('click', closeCreateChannelModal);
  createChannelModal.addEventListener('click', (e) => { if (e.target === createChannelModal) closeCreateChannelModal(); });
  document.querySelector('.create-channel-card').addEventListener('click', e => e.stopPropagation());

  // Channel type selection
  function setChannelType(type) {
    selectedChannelType = type;
    if (type === 'text') {
      channelTypeText.classList.add('selected');
      channelTypeVoice.classList.remove('selected');
    } else {
      channelTypeText.classList.remove('selected');
      channelTypeVoice.classList.add('selected');
    }
  }
  channelTypeText.addEventListener('click', () => setChannelType('text'));
  channelTypeVoice.addEventListener('click', () => setChannelType('voice'));

  // When a server is selected, hide the join-server section and show channels
  function setSelectedServer(serverId) {
    selectedServerId = serverId;
    // Hide join-server UI
    const sidebarTabs = document.getElementById('sidebar-tabs');
    const addFriendPanel = document.getElementById('add-friend-panel');
    if (sidebarTabs) sidebarTabs.style.display = 'none';
    if (addFriendPanel) addFriendPanel.style.display = 'none';
    // Show channels list
    document.querySelectorAll('.channels .channel-btn, .channels .channel-heading').forEach(btn => btn.style.display = '');
    // Show create channel button
    const createChannelBtn = document.querySelector('.create-channel-btn');
    if (createChannelBtn) createChannelBtn.style.display = '';
    loadChannels(serverId, true);
  }

  // Load channels for a server
  async function loadChannels(serverId, autoSelectFirst = false) {
    // Remove old channels (except the create button)
    document.querySelectorAll('.channels .channel-btn, .channels .channel-heading').forEach(btn => btn.remove());
    if (!serverId) return;
    const { data, error } = await supabase
      .from('channels')
      .select('*')
      .eq('server_id', serverId)
      .order('created_at', { ascending: true });
    if (data && Array.isArray(data)) {
      // Group channels by type
      const textChannels = data.filter(c => c.type === 'text');
      const voiceChannels = data.filter(c => c.type === 'voice');
      const fragment = document.createDocumentFragment();
      // Helper to add heading
      function addHeading(label) {
        const heading = document.createElement('div');
        heading.className = 'channel-heading channel-animate-in';
        heading.textContent = label;
        fragment.appendChild(heading);
      }
      let firstChannelBtn = null;
      if (textChannels.length) {
        addHeading('Text Channels');
        textChannels.forEach((channel, idx) => {
          const btn = document.createElement('button');
          btn.className = 'channel-btn';
          btn.innerHTML = `<span class=\"channel-hash\">#<\/span> ${channel.name}`;
          btn.title = channel.name;
          btn.style.display = 'flex';
          btn.style.alignItems = 'center';
          btn.style.gap = '8px';
          btn.classList.add('channel-animate-in');
          void btn.offsetWidth;
          btn.addEventListener('animationend', () => btn.classList.remove('channel-animate-in'), { once: true });
          // Select first channel (welcome) by default
          if (autoSelectFirst && idx === 0) {
            btn.classList.add('selected');
            showChannelContent(channel, data[0].name);
          }
          btn.addEventListener('click', () => {
            selectedChannelId = channel.id;
            showChannelContent(channel, data[0].name);
          });
          if (idx === 0) firstChannelBtn = btn;
          fragment.appendChild(btn);
        });
      }
      if (voiceChannels.length) {
        addHeading('Voice Channels');
        voiceChannels.forEach((channel, idx) => {
          const btn = document.createElement('button');
          btn.className = 'channel-btn';
          btn.innerHTML = `<span class=\"channel-hash\"><i class='fa fa-volume-up'></i><\/span> ${channel.name}`;
          btn.title = channel.name;
          btn.style.display = 'flex';
          btn.style.alignItems = 'center';
          btn.style.gap = '8px';
          btn.classList.add('channel-animate-in');
          void btn.offsetWidth;
          btn.addEventListener('animationend', () => btn.classList.remove('channel-animate-in'), { once: true });
          btn.addEventListener('click', () => {
            selectedChannelId = channel.id;
            showChannelContent(channel, data[0].name);
          });
          fragment.appendChild(btn);
        });
      }
      channelsPanel.appendChild(fragment);
      // If no text channels, select first voice channel
      if (autoSelectFirst && !firstChannelBtn && voiceChannels.length) {
        const firstVoiceBtn = channelsPanel.querySelector('.channel-btn');
        if (firstVoiceBtn) {
          firstVoiceBtn.classList.add('selected');
          showChannelContent(voiceChannels[0], data[0].name);
        }
      }
    }
    // Fetch server info
    const { data: serverData } = await supabase
      .from('servers')
      .select('id, name, owner_id')
      .eq('id', serverId)
      .maybeSingle();
    // Fetch owner username
    let ownerName = '';
    if (serverData && serverData.owner_id) {
      const { data: ownerData } = await supabase
        .from('users')
        .select('username')
        .eq('id', serverData.owner_id)
        .maybeSingle();
      if (ownerData && ownerData.username) {
        ownerName = ownerData.username;
      }
    }
    // Remove previous server name header if any
    const oldHeader = channelsPanel.querySelector('.server-name-header');
    if (oldHeader) oldHeader.remove();
    // Add server owner name header
    if (ownerName) {
      const header = document.createElement('div');
      header.className = 'server-name-header';
      header.innerHTML = `<span>${ownerName.toUpperCase()}'S SERVER</span><div class='server-header-separator'></div>`;
      header.style.fontWeight = 'bold';
      header.style.fontSize = '1.18rem';
      header.style.color = '#fff';
      header.style.background = 'linear-gradient(90deg, #43b581 0%, #23272a 100%)';
      header.style.padding = '16px 0 0 0';
      header.style.letterSpacing = '0.01em';
      header.style.textAlign = 'center';
      header.style.position = 'relative';
      header.style.marginBottom = '0';
      header.style.marginTop = '-17px';
      // Separator line
      const sep = header.querySelector('.server-header-separator');
      sep.style.height = '2px';
      sep.style.background = '#43b581';
      sep.style.margin = '12px 0 0 0';
      sep.style.width = '100%';
      sep.style.display = 'block';
      channelsPanel.insertBefore(header, channelsPanel.firstChild);

      // Only allow owner to open the info window
      const currentUser = getUserSession();
      if (currentUser && currentUser.id === serverData.owner_id) {
        header.style.cursor = 'pointer';
        header.title = 'Click to view server info';
        header.onclick = async function(e) {
          e.stopPropagation();
          // Close any existing info window
          const oldInfo = document.getElementById('server-info-dropdown');
          if (oldInfo) oldInfo.remove();
          // Create dropdown
          const dropdown = document.createElement('div');
          dropdown.id = 'server-info-dropdown';
          dropdown.style.position = 'absolute';
          dropdown.style.left = '50%';
          dropdown.style.transform = 'translateX(-50%)';
          dropdown.style.top = '100%';
          dropdown.style.marginTop = '8px';
          dropdown.style.background = '#23272a';
          dropdown.style.color = '#fff';
          dropdown.style.borderRadius = '12px';
          dropdown.style.boxShadow = '0 4px 24px 0 rgba(67,181,129,0.18)';
          dropdown.style.padding = '18px 22px 16px 22px';
          dropdown.style.minWidth = '260px';
          dropdown.style.zIndex = 1000;
          dropdown.style.textAlign = 'left';
          // Server ID (8 digits)
        
          // Members list
          dropdown.innerHTML = `<div style='font-size:1.08rem;font-weight:600;margin-bottom:8px;'>Server ID: <span id='server-id-val' style='font-family:monospace;'>${serverData && serverData.id ? serverData.id : 'Unknown'}</span> <button id='copy-server-id-btn' style='margin-left:8px;padding:2px 8px;font-size:0.98rem;border-radius:6px;border:none;background:#43b581;color:#fff;cursor:pointer;'>Copy</button> <span id='copy-feedback' style='color:#43b581;font-size:0.98rem;margin-left:6px;display:none;'>Copied!</span></div>`;
          dropdown.innerHTML += `<div style='font-size:1.05rem;font-weight:600;margin:10px 0 6px 0;'>Members</div><div id='server-members-list' style='min-height:40px;opacity:0;transition:opacity 0.4s;'></div>`;
          header.appendChild(dropdown);
          // Copy button logic
          const copyIdBtn = dropdown.querySelector('#copy-server-id-btn');
          const copyIdFeedback = dropdown.querySelector('#copy-feedback');
          if (copyIdBtn) {
            copyIdBtn.onclick = function() {
              navigator.clipboard.writeText(serverData && serverData.id ? serverData.id : '');
              copyIdFeedback.style.display = 'inline';
              setTimeout(() => { copyIdFeedback.style.display = 'none'; }, 1200);
            };
          }
          
          // Show loading spinner
          const membersDiv = dropdown.querySelector('#server-members-list');
          membersDiv.innerHTML = `<div style='display:flex;align-items:center;justify-content:center;height:36px;'><span class='fa fa-spinner fa-spin' style='color:#43b581;font-size:1.3rem;'></span></div>`;
          // Fetch and render members
          const { data: members } = await supabase
            .from('server_members')
            .select('user_id, users(username, avatar_url)')
            .eq('server_id', serverId);
          // Prepare members HTML
          let membersHTML = '';
          if (members && members.length > 0) {
            members.forEach(m => {
              const u = m.users;
              const avatar = u.avatar_url ? `<img src='${u.avatar_url}' style='width:26px;height:26px;border-radius:50%;margin-right:8px;vertical-align:middle;'>` : '';
              const name = `<span style='font-size:1.01rem;vertical-align:middle;'>${u.username}</span>`;
              membersHTML += `<div style='display:flex;align-items:center;gap:8px;margin-bottom:6px;'>${avatar}${name}</div>`;
            });
          } else {
            membersHTML = '<div style="color:#aaa;font-size:0.98rem;">No members found.</div>';
          }
          // Fade in members after a short delay
          setTimeout(() => {
            membersDiv.innerHTML = membersHTML;
            membersDiv.style.opacity = '1';
          }, 120);
          // Close dropdown on click outside
          setTimeout(() => {
            document.addEventListener('mousedown', function handler(ev) {
              if (!dropdown.contains(ev.target) && ev.target !== header) {
                dropdown.remove();
                document.removeEventListener('mousedown', handler);
              }
            });
          }, 0);
        };
      }
    }
  }

  // --- Helper: Fetch messages for a channel ---
  async function fetchMessagesForChannel(channelId) {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('channel_id', channelId)
      .order('created_at', { ascending: true });
    return data || [];
  }

  // --- Helper: Fetch server owner display name ---
  async function fetchServerOwnerName(serverId) {
    // Get owner_id from servers table
    const { data: server, error: serverError } = await supabase
      .from('servers')
      .select('owner_id')
      .eq('id', serverId)
      .maybeSingle();
    if (!server || !server.owner_id) return null;
    // Get username from users table
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('username')
      .eq('id', server.owner_id)
      .maybeSingle();
    return user ? user.username : null;
  }

  // Show channel content in main panel (Discord-like: chat is main content, left-aligned, header/messages/input)
  async function showChannelContent(selectedChannel, serverName = "Your Server") {
    lastSelectedChannel = selectedChannel;
    lastSelectedServerName = serverName;
    hideDefaultWelcome();
    selectedChannelId = selectedChannel.id;
    const mainPanel = document.querySelector('.main-panel');
    // Only show welcome card if a server and a text channel are selected
    if (selectedChannel && selectedChannel.type === 'text') {
      // Fetch messages for this channel
      const messages = await fetchMessagesForChannel(selectedChannel.id);
      // Fetch user info for all unique user_ids in messages
      const userIds = Array.from(new Set(messages.map(m => m.user_id)));
      const uncached = userIds.filter(id => !channelUserCache[id]);
      if (uncached.length > 0) {
        const { data: usersData } = await supabase
          .from('users')
          .select('id, username, avatar_url')
          .in('id', uncached);
        if (usersData) usersData.forEach(u => { channelUserCache[u.id] = u; });
      }
        // Show normal chat area
        mainPanel.innerHTML = `
          <div class="main-chat-header">
            <span class="main-chat-header-hash">#</span>
            <span class="main-chat-header-name">${selectedChannel.name}</span>
          </div>
          <div class="main-chat-flex-col">
            <div class="main-chat-messages" id="main-chat-messages">
            ${messages.map(msg => {
              const user = channelUserCache[msg.user_id] || { username: 'Unknown', avatar_url: '' };
              return `<div class=\"main-chat-message\">
                <img class=\"friend-avatar\" src=\"${user.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.username)}`}\" alt=\"Avatar\">
                <div class=\"main-chat-message-content\">
                  <div class=\"main-chat-message-header\">
                    <span class=\"main-chat-message-username\">${user.username}</span>
                    <span class=\"main-chat-message-time\">${new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <div class=\"main-chat-message-text\">${msg.content}</div>
                </div>
              </div>`;
            }).join('')}
            </div>
            <div class="main-chat-input-row">
              <button class="main-input-icon main-input-media" title="Send Media"><i class="fa fa-paperclip"></i></button>
              <input class="main-chat-input" id="chat-input" type="text" placeholder="Message #${selectedChannel.name}" />
              <button id="emoji-button" class="main-input-icon" title="Emoji Picker">😊</button>
              <button class="main-chat-send"><i class="fa fa-paper-plane"></i></button>
            </div>
          </div>
        `;
      // Focus input automatically
      setTimeout(() => {
        const chatInput = document.getElementById('chat-input');
        if (chatInput) chatInput.focus();
      }, 100);
      // After rendering the chat input row:
      const sendBtn = document.querySelector('.main-chat-send');
      const chatInput = document.getElementById('chat-input');
      if (sendBtn && chatInput) {
        sendBtn.onclick = sendChannelMessage;
        chatInput.addEventListener('keydown', e => {
          if (e.key === 'Enter') sendChannelMessage();
        });
      }
      // Scroll to bottom
      setTimeout(() => {
        const messagesDiv = document.getElementById('main-chat-messages');
        if (messagesDiv) messagesDiv.scrollTop = messagesDiv.scrollHeight;
      }, 120);
      // Setup live updates for this channel ONLY if channel changed
      if (currentRealtimeChannelId !== selectedChannel.id) {
        if (channelRealtimeSubscription) {
          supabase.removeChannel(channelRealtimeSubscription);
          channelRealtimeSubscription = null;
        }
        channelRealtimeSubscription = supabase.channel('realtime:messages_' + selectedChannel.id)
          .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'messages',
            filter: `channel_id=eq.${selectedChannel.id}`
          }, payload => {
            console.log('Realtime event for channel:', selectedChannel.id, payload);
            if (selectedChannelId === selectedChannel.id) {
              // Only reload messages, do not re-subscribe
              reloadChannelMessages(selectedChannel.id);
            }
          })
          .subscribe();
        currentRealtimeChannelId = selectedChannel.id;
      }
    } else if (selectedChannel && selectedChannel.type === 'voice') {
      // --- ROBUST MULTI-USER VOICE CHANNEL LOGIC ---
      const currentUser = getUserSession();
      let voiceMembers = [];
      let hasJoined = false;
      let voiceSubscription = null;
      let voiceChannelName = null;

      // Helper: fetch all members in this voice channel
      async function fetchVoiceMembers() {
        const now = Date.now();
        const { data } = await supabase
          .from('voice_channel_members')
          .select('user_id, muted, last_seen, users: user_id (username, avatar_url)')
          .eq('channel_id', selectedChannel.id);
        // Only include members with last_seen within the last 10 seconds
        voiceMembers = (data || []).filter(m => {
          if (!m.last_seen) return false;
          return (now - new Date(m.last_seen).getTime()) < 10000;
        });
        renderVoiceMembers();
      }

      // Helper: render all members as tiles
      function renderVoiceMembers() {
        const mainPanel = document.querySelector('.main-panel');
        const isInChannel = voiceMembers.some(m => m.user_id === currentUser.id);
        if (!isInChannel) {
          mainPanel.innerHTML = '<div class="main-voice-center-msg">You left the voice channel.</div>';
          return;
        }
        const header = `
        <div class="main-chat-header">
          <span class="main-chat-header-hash"><i class='fa fa-volume-up'></i></span>
          <span class="main-chat-header-name">${selectedChannel.name}</span>
        </div>
        `;
        const grid = `
          <div class="voice-main-content voice-users-grid">
            ${voiceMembers.map(m => {
              const u = m.users || {};
              const avatar = u.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.username || 'User')}`;
              const isMuted = m.muted;
              return `
                <div class="voice-user-tile">
                  <img class="voice-user-avatar" src="${avatar}" alt="Avatar">
                  <div class="voice-user-label">
                    <i class="fa ${isMuted ? 'fa-microphone-slash' : 'fa-microphone'}" style="margin-right:6px;${isMuted ? 'color:#e74c3c;' : ''}"></i>
                    ${u.username || 'Unknown'}
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        `;
        const controls = `
          <div class="voice-controls-bar">
            <button class="voice-control-btn" id="voice-mute-btn" title="Mute/Unmute"><i class="fa fa-microphone${getCurrentUserMuted() ? '-slash' : ''}"></i></button>
            <button class="voice-control-btn" id="voice-deafen-btn" title="Deafen (not implemented)"><i class="fa fa-headphones"></i></button>
            <button class="voice-control-btn" id="voice-screenshare-btn" title="Screen Share (coming soon)" disabled><i class="fa fa-desktop"></i></button>
            <button class="voice-control-btn" id="voice-more-btn" title="More"><i class="fa fa-ellipsis-h"></i></button>
            <button class="voice-control-btn voice-leave-btn" id="voice-leave-btn" title="Leave Call"><i class="fa fa-phone"></i></button>
          </div>
        `;
        mainPanel.innerHTML = header + grid + controls;
        // Controls event listeners
        document.getElementById('voice-mute-btn').onclick = toggleMute;
        document.getElementById('voice-leave-btn').onclick = leaveVoiceChannel;
        document.getElementById('voice-deafen-btn').onclick = () => alert('Deafen coming soon!');
        document.getElementById('voice-screenshare-btn').onclick = () => alert('Screen share coming soon!');
        document.getElementById('voice-more-btn').onclick = () => alert('More options coming soon!');
        // Add grid class logic
        const gridDiv = mainPanel.querySelector('.voice-users-grid');
        if (gridDiv) {
          gridDiv.classList.remove('single-user', 'two-users');
          if (voiceMembers.length === 1) {
            gridDiv.classList.add('single-user');
          } else if (voiceMembers.length === 2) {
            gridDiv.classList.add('two-users');
          }
        }
      }

      function getCurrentUserMuted() {
        const m = voiceMembers.find(m => m.user_id === currentUser.id);
        return m ? m.muted : false;
      }

      // --- Subscription Management ---
      function removeVoiceSubscription() {
        if (voiceSubscription && isRealtimeConnected()) {
          supabase.removeChannel(voiceSubscription);
          voiceSubscription = null;
          voiceChannelName = null;
          isVoiceSubscribed = false;
        }
      }

      function subscribeVoiceMembers() {
        if (!isRealtimeConnected() || isVoiceSubscribed) return; // Don't subscribe if not connected or already subscribed
        removeVoiceSubscription();
        voiceChannelName = 'realtime:voice_channel_members_' + selectedChannel.id + '_' + Date.now() + '_' + Math.floor(Math.random() * 100000);
        voiceSubscription = supabase.channel(voiceChannelName)
          .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'voice_channel_members',
            filter: `channel_id=eq.${selectedChannel.id}`
          }, payload => {
            console.log('Realtime event:', payload); // Debug log
            fetchVoiceMembers();
          })
          .subscribe();
        isVoiceSubscribed = true;
      }

      // --- Join/Leave Logic ---
      async function joinVoiceChannel() {
        if (hasJoined) return;
        hasJoined = true;
        // Remove any old entry for this user/channel
        await supabase.from('voice_channel_members')
          .delete()
          .eq('channel_id', selectedChannel.id)
          .eq('user_id', currentUser.id);
        // Subscribe to realtime BEFORE inserting your row (if not already subscribed)
        if (isRealtimeConnected() && !isVoiceSubscribed) {
          subscribeVoiceMembers();
        }
        // Insert new entry with last_seen
        await supabase.from('voice_channel_members').insert({
          channel_id: selectedChannel.id,
          user_id: currentUser.id,
          muted: false,
          last_seen: new Date().toISOString()
        });
        // Start heartbeat to update last_seen every 5 seconds
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        heartbeatInterval = setInterval(async () => {
          if (hasJoined) {
            await supabase.from('voice_channel_members')
              .update({ last_seen: new Date().toISOString() })
              .eq('channel_id', selectedChannel.id)
              .eq('user_id', currentUser.id);
          }
        }, 5000);
        // Wait for DB, then fetch members
        setTimeout(() => {
          fetchVoiceMembers();
        }, 200);
        // Add cleanup on tab close
        window.removeEventListener('beforeunload', cleanupVoiceChannelOnUnload);
        window.addEventListener('beforeunload', cleanupVoiceChannelOnUnload);
      }

      async function leaveVoiceChannel() {
        hasJoined = false;
        if (heartbeatInterval) {
          clearInterval(heartbeatInterval);
          heartbeatInterval = null;
        }
        await supabase.from('voice_channel_members')
          .delete()
          .eq('channel_id', selectedChannel.id)
          .eq('user_id', currentUser.id);
        // Unsubscribe from realtime if connected
        if (isRealtimeConnected()) {
          removeVoiceSubscription();
        }
        window.removeEventListener('beforeunload', cleanupVoiceChannelOnUnload);
        // Show only the left message, do not fetch/render members again
        const mainPanel = document.querySelector('.main-panel');
        if (mainPanel) mainPanel.innerHTML = '<div class="main-voice-center-msg">You left the voice channel.</div>';
        // Always fetch members to update UI for others
        fetchVoiceMembers();
      }

      async function cleanupVoiceChannelOnUnload() {
        if (heartbeatInterval) {
          clearInterval(heartbeatInterval);
          heartbeatInterval = null;
        }
        await supabase.from('voice_channel_members')
          .delete()
          .eq('channel_id', selectedChannel.id)
          .eq('user_id', currentUser.id);
        if (isRealtimeConnected()) {
          removeVoiceSubscription();
        }
        window.removeEventListener('beforeunload', cleanupVoiceChannelOnUnload);
      }

      async function toggleMute() {
        const m = voiceMembers.find(m => m.user_id === currentUser.id);
        if (!m) return;
        await supabase.from('voice_channel_members')
          .update({ muted: !m.muted })
          .eq('channel_id', selectedChannel.id)
          .eq('user_id', currentUser.id);
      }

      // --- Start logic ---
      await joinVoiceChannel();
      await fetchVoiceMembers();
      subscribeVoiceMembers();
    }
    setupEmojiButton();
  }

  // Helper to reload only messages for a channel (without re-subscribing)
  async function reloadChannelMessages(channelId) {
    const messages = await fetchMessagesForChannel(channelId);
    const userIds = Array.from(new Set(messages.map(m => m.user_id)));
    const uncached = userIds.filter(id => !channelUserCache[id]);
    if (uncached.length > 0) {
      const { data: usersData } = await supabase
        .from('users')
        .select('id, username, avatar_url')
        .in('id', uncached);
      if (usersData) usersData.forEach(u => { channelUserCache[u.id] = u; });
    }
    const messagesDiv = document.getElementById('main-chat-messages');
    if (messagesDiv) {
      messagesDiv.innerHTML = messages.map(msg => {
        const user = channelUserCache[msg.user_id] || { username: 'Unknown', avatar_url: '' };
        return `<div class=\"main-chat-message\">\n        <img class=\"friend-avatar\" src=\"${user.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.username)}`}\" alt=\"Avatar\">\n        <div class=\"main-chat-message-content\">\n          <div class=\"main-chat-message-header\">\n            <span class=\"main-chat-message-username\">${user.username}</span>\n            <span class=\"main-chat-message-time\">${new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>\n          </div>\n          <div class=\"main-chat-message-text\">${msg.content}</div>\n        </div>\n      </div>`;
      }).join('');
      // Scroll to bottom
      setTimeout(() => {
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
      }, 80);
    }
  }

  // In sendChannelMessage, after sending, just reload messages, do not call showChannelContent
  async function sendChannelMessage() {
    const input = document.getElementById('chat-input');
    if (!input || !selectedChannelId) return;
    const content = input.value.trim();
    if (!content) return;
    input.value = '';
    const currentUser = getUserSession();
    const { error } = await supabase.from('messages').insert({
      channel_id: selectedChannelId,
      user_id: currentUser.id,
      content,
      created_at: new Date().toISOString()
    });
    if (error) {
      alert('Failed to send message: ' + error.message);
      return;
    }
    await reloadChannelMessages(selectedChannelId);
  }

  // --- Media & Emoji Icon Functionality ---
  document.addEventListener('click', function(e) {
    // Media icon click
    if (e.target.closest('.main-input-media')) {
      let input = document.getElementById('main-input-file');
      if (!input) {
        input = document.createElement('input');
        input.type = 'file';
        input.style.display = 'none';
        input.id = 'main-input-file';
        document.body.appendChild(input);
        input.addEventListener('change', function() {
          if (input.files && input.files[0]) {
            alert('Selected file: ' + input.files[0].name); // Replace with upload logic
          }
        });
      }
      input.value = '';
      input.click();
    }
  });

  // Create channel
  createChannelSubmit.addEventListener('click', async () => {
    const name = channelNameInput.value.trim();
    if (!name) {
      channelNameInput.focus();
      channelNameInput.placeholder = 'Enter a channel name!';
      return;
    }
    if (!selectedServerId) return;
    const currentUser = getUserSession();
    const { data, error } = await supabase
      .from('channels')
      .insert([{ name, type: selectedChannelType, server_id: selectedServerId, is_private: privateChannelToggle.checked, creator_id: currentUser.id }])
      .select();
    if (error) {
      alert('Error creating channel: ' + error.message);
    } else {
      closeCreateChannelModal();
      loadChannels(selectedServerId);
    }
  });

  // --- Emoji Button integration ---
  function setupEmojiButton() {
    if (!window.EmojiButton) return;
    const emojiBtn = document.querySelector('#emoji-button');
    const chatInput = document.querySelector('#chat-input');
    if (!emojiBtn || !chatInput) return;
    if (emojiBtn._emojiPickerAttached) return; // Prevent double attaching
    emojiBtn._emojiPickerAttached = true;
    const picker = new window.EmojiButton({
      theme: 'auto',
      position: 'top-end',
      zIndex: 2000
    });
    emojiBtn.addEventListener('click', () => {
      picker.togglePicker(emojiBtn);
    });
    picker.on('emoji', emoji => {
      // Insert at cursor position
      const start = chatInput.selectionStart;
      const end = chatInput.selectionEnd;
      const val = chatInput.value;
      chatInput.value = val.slice(0, start) + emoji + val.slice(end);
      chatInput.focus();
      chatInput.selectionStart = chatInput.selectionEnd = start + emoji.length;
    });
  }

  // --- JOIN SERVER / FRIENDS UI LOGIC ---
  const joinServerBtn = document.querySelector('.join-server-btn');
  const sidebarTabs = document.getElementById('sidebar-tabs');
  const tabAddFriend = document.getElementById('tab-add-friend');
  const tabJoinChannel = document.getElementById('tab-join-channel');
  const tabRequests = document.getElementById('tab-requests');
  const addFriendPanel = document.getElementById('add-friend-panel');
  const addFriendInput = document.getElementById('add-friend-input');
  const addFriendBtn = document.getElementById('add-friend-btn');
  const addFriendMessage = document.getElementById('add-friend-message');
  const mainPanel = document.querySelector('.main-panel');
  const requestsPanel = document.getElementById('requests-panel');
  const friendsListPanel = document.getElementById('friends-list-panel');

  // Helper to show only the correct panel in mainPanel for friends/join server UI
  function showMainPanelTab(tab) {
    hideDefaultWelcome();
    // Remove all children
    while (mainPanel.firstChild) mainPanel.removeChild(mainPanel.firstChild);
    // Hide all panels by default
    addFriendPanel.style.display = 'none';
    requestsPanel.style.display = 'none';
    // Show the correct panel
    if (tab === 'add-friend') {
      mainPanel.appendChild(addFriendPanel);
      addFriendPanel.style.display = 'block';
      setTimeout(() => addFriendInput.focus(), 100);
    } else if (tab === 'requests') {
      mainPanel.appendChild(requestsPanel);
      requestsPanel.style.display = 'flex';
      renderFriendRequests();
    }
  }

  // Update joinServerBtn click handler to use showMainPanelTab
  joinServerBtn.addEventListener('click', () => {
    friendsListPanel.style.display = 'none';
    sidebarTabs.style.display = 'flex';
    tabAddFriend.classList.remove('selected');
    tabJoinChannel.classList.add('selected');
    tabRequests.classList.remove('selected');
    // Remove all main panel children (clear chat environment)
    while (mainPanel.firstChild) mainPanel.removeChild(mainPanel.firstChild);
    // Hide all panels by default
    addFriendPanel.style.display = 'none';
    requestsPanel.style.display = 'none';
    // Show join channel/server panel or placeholder
    let joinPanel = document.getElementById('join-server-panel');
    if (!joinPanel) {
      joinPanel = document.createElement('div');
      joinPanel.id = 'join-server-panel';
      joinPanel.style.display = 'flex';
      joinPanel.style.flexDirection = 'column';
      joinPanel.style.alignItems = 'center';
      joinPanel.style.justifyContent = 'center';
      joinPanel.style.height = '100%';
      joinPanel.style.width = '100%';
      joinPanel.innerHTML = `
        <div class="main-welcome-card" style="margin-top:48px;">
          <div style="font-size:3.5rem;color:#43b581;margin-bottom:18px;">
            <i class="fa fa-link"></i>
          </div>
          <div class="main-welcome-title">Join a Server</div>
          <div class="main-welcome-desc">Enter an invite code below to join a community, or ask your friends for an invite!</div>
          <div style="width:100%;display:flex;flex-direction:column;align-items:center;gap:12px;">
            <input type="text" id="join-server-input" class="add-friend-input" style="width:220px;font-size:1.13rem;text-align:center;" placeholder="Invite Code (e.g. abcd1234)" autocomplete="off" />
            <button id="join-server-btn" class="add-friend-btn" style="width:100%;max-width:220px;">Join</button>
          </div>
          <div id="join-server-message" style="color:#aaa;font-size:1.01rem;margin-top:18px;"></div>
        </div>
      `;
      mainPanel.appendChild(joinPanel);
    } else {
      joinPanel.style.display = 'flex';
      mainPanel.appendChild(joinPanel);
    }
    // Hide channels list
    document.querySelectorAll('.channels .channel-btn, .channels .channel-heading').forEach(btn => btn.style.display = 'none');
    if (createChannelBtn) createChannelBtn.style.display = 'none';
    const serverHeader = document.querySelector('.server-name-header');
    if (serverHeader) serverHeader.style.display = 'none';

    // Add join logic
    const joinInput = document.getElementById('join-server-input');
    const joinBtn = document.getElementById('join-server-btn');
    const joinMsg = document.getElementById('join-server-message');
    joinBtn.onclick = async () => {
      const code = joinInput.value.trim();
      if (!code) {
        joinMsg.textContent = 'Please enter an invite code.';
        joinMsg.style.color = '#e74c3c';
        return;
      }
      if (!isValidUUID(code)) {
        joinMsg.textContent = 'Invalid invite code format.';
        joinMsg.style.color = '#e74c3c';
        return;
      }
      joinBtn.disabled = true;
      joinBtn.textContent = 'Joining...';
      joinMsg.textContent = '';
      // Try to find server by code (assume code is server id for now)
      const { data: server, error } = await supabase
        .from('servers')
        .select('id, name')
        .eq('id', code)
        .maybeSingle();
      if (!server || error) {
        joinMsg.textContent = 'Invalid invite code or server not found.';
        joinMsg.style.color = '#e74c3c';
        joinBtn.disabled = false;
        joinBtn.textContent = 'Join';
        return;
      }
      // Add user to server_members if not already a member
      const currentUser = getUserSession();
      const { data: existing } = await supabase
        .from('server_members')
        .select('id')
        .eq('user_id', currentUser.id)
        .eq('server_id', server.id)
        .maybeSingle();
      if (existing) {
        joinMsg.textContent = 'You are already a member of this server!';
        joinMsg.style.color = '#43b581';
        joinBtn.disabled = false;
        joinBtn.textContent = 'Join';
        return;
      }
      const { error: joinError } = await supabase
        .from('server_members')
        .insert({ user_id: currentUser.id, server_id: server.id, role: 'member' });
      if (joinError) {
        joinMsg.textContent = 'Failed to join server.';
        joinMsg.style.color = '#e74c3c';
        joinBtn.disabled = false;
        joinBtn.textContent = 'Join';
        return;
      }
      joinMsg.textContent = `Joined server: ${server.name}!`;
      joinMsg.style.color = '#43b581';
      joinBtn.disabled = false;
      joinBtn.textContent = 'Join';
      joinInput.value = '';
      // Reload servers
      await loadServers();
    };
    joinInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') joinBtn.click();
    });
  });

  // Tab switching logic (Add Friend, Join Channel, Requests)
  tabAddFriend.addEventListener('click', () => {
    tabAddFriend.classList.add('selected');
    tabJoinChannel.classList.remove('selected');
    tabRequests.classList.remove('selected');
    showMainPanelTab('add-friend');
  });
  tabJoinChannel.addEventListener('click', () => {
    tabAddFriend.classList.remove('selected');
    tabJoinChannel.classList.add('selected');
    tabRequests.classList.remove('selected');
    showMainPanelTab('join-channel');
  });
  tabRequests.addEventListener('click', () => {
    tabAddFriend.classList.remove('selected');
    tabJoinChannel.classList.remove('selected');
    tabRequests.classList.add('selected');
    showMainPanelTab('requests');
    renderFriendRequests();
  });

  // Update renderFriendRequests to show all requests with status
  async function renderFriendRequests() {
    const currentUser = getUserSession();
    requestsPanel.innerHTML = '<div class="requests-title">Friend Requests</div>';
    // Fetch all requests where current user is the receiver
    const { data: requests, error } = await supabase
      .from('friends')
      .select('id, user_id, status, users:user_id(username, avatar_url, friend_code)')
      .eq('friend_id', currentUser.id);
    if (error || !requests || requests.length === 0) {
      requestsPanel.innerHTML += '<div class="requests-empty-message">No requests data.</div>';
      return;
    }
    // Group requests by status
    const grouped = { pending: [], accepted: [], declined: [] };
    requests.forEach(req => {
      if (grouped[req.status]) grouped[req.status].push(req);
    });
    if (grouped.pending.length === 0 && grouped.accepted.length === 0 && grouped.declined.length === 0) {
      requestsPanel.innerHTML += '<div class="requests-empty-message">No requests data.</div>';
      return;
    }
    // Helper to render a group
    function renderGroup(title, arr, color) {
      if (arr.length === 0) return;
      requestsPanel.innerHTML += `<div class="requests-group-title" style="color:${color};margin-top:18px;font-weight:700;">${title}</div>`;
      arr.forEach(req => {
      const user = req.users;
      const avatar = user.avatar_url ? `<img src="${user.avatar_url}" alt="avatar" style="width:32px;height:32px;border-radius:50%;margin-right:8px;">` : '';
      const card = document.createElement('div');
      card.className = 'request-card';
      card.innerHTML = `
        <div class="request-user">${avatar}<span>${user.username}</span> <span style="color:#4a90e2;font-size:0.98rem;">#${user.friend_code}</span></div>
          <div class="request-status-label" style="color:${color};font-weight:600;">${req.status.charAt(0).toUpperCase() + req.status.slice(1)}</div>
      `;
        if (req.status === 'pending') {
      // Accept button logic
          const actions = document.createElement('div');
          actions.className = 'request-actions';
          const acceptBtn = document.createElement('button');
          acceptBtn.className = 'request-accept-btn';
          acceptBtn.textContent = 'Accept';
          acceptBtn.onclick = async () => {
            acceptBtn.disabled = true;
            declineBtn.disabled = true;
        card.style.opacity = 0.5;
            actions.innerHTML = '<span style="color:#43b581;font-weight:600;">Accepted</span>';
            await supabase.from('friends').update({ status: 'accepted' }).eq('id', req.id);
          };
          const declineBtn = document.createElement('button');
          declineBtn.className = 'request-decline-btn';
          declineBtn.textContent = 'Decline';
          declineBtn.onclick = async () => {
            acceptBtn.disabled = true;
            declineBtn.disabled = true;
            await supabase.from('friends').update({ status: 'declined' }).eq('id', req.id);
        card.style.opacity = 0.5;
            actions.innerHTML = '<span style="color:#e74c3c;font-weight:600;">Declined</span>';
      };
          actions.appendChild(acceptBtn);
          actions.appendChild(declineBtn);
          card.appendChild(actions);
        }
      requestsPanel.appendChild(card);
    });
    }
    renderGroup('Pending', grouped.pending, '#ffb347');
    renderGroup('Accepted', grouped.accepted, '#43b581');
    renderGroup('Declined', grouped.declined, '#e74c3c');
  }

  // Add Friend logic
  addFriendBtn.addEventListener('click', async () => {
    const code = addFriendInput.value.trim();
    addFriendMessage.textContent = '';
    addFriendMessage.classList.remove('success');
    if (!/^[0-9]{6}$/.test(code)) {
      addFriendMessage.textContent = 'Please enter a valid 6-digit Friend Code.';
      return;
    }
    addFriendBtn.disabled = true;
    // Check if user exists
    const { data: user, error } = await supabase.from('users').select('id, username').eq('friend_code', code).maybeSingle();
    if (error) {
      addFriendMessage.textContent = 'Error searching for user.';
      addFriendBtn.disabled = false;
      return;
    }
    if (!user) {
      addFriendMessage.textContent = 'User not found.';
      addFriendBtn.disabled = false;
      return;
    }
    const currentUser = getUserSession();
    if (user.id === currentUser.id) {
      addFriendMessage.textContent = 'You cannot add yourself as a friend!';
      addFriendBtn.disabled = false;
      return;
    }
    // Check if already friends or request exists
    const { data: existing } = await supabase
      .from('friends')
      .select('*')
      .or(`and(user_id.eq.${currentUser.id},friend_id.eq.${user.id}),and(user_id.eq.${user.id},friend_id.eq.${currentUser.id})`)
      .maybeSingle();
    if (existing) {
      if (existing.status === 'accepted') {
        addFriendMessage.textContent = 'You are already friends!';
      } else if (existing.status === 'pending') {
        addFriendMessage.textContent = 'Friend request already sent or pending.';
      } else {
        addFriendMessage.textContent = 'A friend relationship already exists.';
      }
      addFriendBtn.disabled = false;
      return;
    }
    // Send friend request
    const { error: reqError } = await supabase.from('friends').insert({ user_id: currentUser.id, friend_id: user.id, status: 'pending' });
    if (reqError) {
      addFriendMessage.textContent = 'Failed to send friend request.';
      addFriendBtn.disabled = false;
      return;
    }
    addFriendMessage.textContent = 'Friend request sent!';
    addFriendMessage.classList.add('success');
    addFriendBtn.disabled = true;
  });
  addFriendInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') addFriendBtn.click();
  });

  const messagesBtn = document.querySelector('.messages-btn');

  messagesBtn.addEventListener('click', async () => {
    // Hide sidebar-tabs and channels
    sidebarTabs.style.display = 'none';
    document.querySelectorAll('.channels .channel-btn, .channels .channel-heading').forEach(btn => btn.style.display = 'none');
    createChannelBtn.style.display = 'none';
    // Show friends list panel
    friendsListPanel.style.display = 'flex';
    renderFriendsList();
    // Remove all main panel children to ensure no lingering content
    while (mainPanel.firstChild) mainPanel.removeChild(mainPanel.firstChild);
    // Try to reopen last DM chat
    const lastId = getLastDMFriendId();
    if (lastId) {
      // Find friend object from friends list
      const { data, error } = await supabase
        .from('friends')
        .select('id, user_id, friend_id, status, user:user_id(username, avatar_url, friend_code), friend:friend_id(username, avatar_url, friend_code)')
        .or(`user_id.eq.${currentUser.id},friend_id.eq.${currentUser.id}`)
        .eq('status', 'accepted');
      if (data && data.length > 0) {
        const friendRow = data.find(row => row.user_id === lastId || row.friend_id === lastId);
        if (friendRow) {
          const isSelfUser = friendRow.user_id === currentUser.id;
          const friendUser = isSelfUser ? friendRow.friend : friendRow.user;
          const friendId = isSelfUser ? friendRow.friend_id : friendRow.user_id;
          openDMChat({
            id: friendId,
            username: friendUser?.username || 'Unknown',
            avatar_url: friendUser?.avatar_url || '',
            friend_code: friendUser?.friend_code || '',
            status: 'Online',
          });
          return;
        }
      }
    }
    // Show DM landing UI if no last DM
    const dmCenter = document.createElement('div');
    dmCenter.style.display = 'flex';
    dmCenter.style.flexDirection = 'column';
    dmCenter.style.alignItems = 'center';
    dmCenter.style.justifyContent = 'center';
    dmCenter.style.height = '100%';
    dmCenter.style.marginTop = '80px';
    dmCenter.innerHTML = `
      <div style="font-size:3.2rem;color:#4a90e2;margin-bottom:18px;"><i class="fa fa-comments"></i></div>
      <div style="font-size:1.7rem;font-weight:700;color:#f3f3f3;">Chat with Friends</div>
      <div style="color:#aaa;font-size:1.08rem;margin-top:8px;">Select a friend to start chatting!</div>
    `;
    mainPanel.appendChild(dmCenter);
  });

  // --- DM CHAT LOGIC ---
  function renderFriendsList() {
    friendsListPanel.innerHTML = '<div class="friends-list-title">Friends</div>';
    supabase
      .from('friends')
      .select('id, user_id, friend_id, status, user:user_id(username, avatar_url, friend_code), friend:friend_id(username, avatar_url, friend_code)')
      .or(`user_id.eq.${currentUser.id},friend_id.eq.${currentUser.id}`)
      .eq('status', 'accepted')
      .then(({ data, error }) => {
        if (error || !data || data.length === 0) {
          friendsListPanel.innerHTML += '<div class="friends-list-empty">No friends yet.</div>';
          return;
        }
        const friends = data.map(row => {
          const isSelfUser = row.user_id === currentUser.id;
          const friendUser = isSelfUser ? row.friend : row.user;
          const friendId = isSelfUser ? row.friend_id : row.user_id;
          return {
            id: friendId,
            username: friendUser?.username || 'Unknown',
            avatar_url: friendUser?.avatar_url || '',
            friend_code: friendUser?.friend_code || '',
            status: 'Online',
          };
        });
        friends.forEach(friend => {
          const card = document.createElement('div');
          card.className = 'friend-card';
          card.innerHTML = `
            <img class="friend-avatar" src="${friend.avatar_url}" alt="Avatar">
            <span class="friend-username">${friend.username}</span>
            <span class="friend-status">${friend.status}</span>
          `;
          card.addEventListener('click', () => openDMChat(friend));
          friendsListPanel.appendChild(card);
        });
      });
  }

  // Open DM chat with a friend
  async function openDMChat(friend) {
    hideDefaultWelcome();
    currentOpenDMFriendId = friend.id;
    setLastDMFriendId(friend.id);
    // Clear rendered message IDs for this friend so all messages are re-rendered
    renderedDMMessageIds[friend.id] = new Set();
    // Clear main panel
    while (mainPanel.firstChild) mainPanel.removeChild(mainPanel.firstChild);
    // Header
    const header = document.createElement('div');
    header.className = 'main-chat-header';
    header.innerHTML = `
      <img src="${friend.avatar_url}" class="friend-avatar" style="width:36px;height:36px;margin-right:10px;">
      <span class="main-chat-header-name">${friend.username}</span>
      <span style="color:#4a90e2;font-size:1.05rem;margin-left:8px;">#${friend.friend_code}</span>
    `;
    mainPanel.appendChild(header);
    // Messages area
    const messagesArea = document.createElement('div');
    messagesArea.className = 'main-chat-messages';
    messagesArea.id = 'dm-messages';
    mainPanel.appendChild(messagesArea);
    // Input row
    const inputRow = document.createElement('div');
    inputRow.className = 'main-chat-input-row';
    inputRow.innerHTML = `
      <input class="main-chat-input" id="dm-chat-input" type="text" placeholder="Message ${friend.username}" autocomplete="off" />
      <button id="dm-emoji-button" class="main-input-icon" title="Emoji Picker">😊</button>
      <button class="main-chat-send" id="dm-send-btn"><i class="fa fa-paper-plane"></i></button>
    `;
    mainPanel.appendChild(inputRow);
    // Emoji picker
    setupDMEmojiButton();
    // Load messages
    await loadDMMessages(friend.id);
    // Mark all messages from this friend as read
    await supabase.from('direct_messages')
      .update({ read: true })
      .eq('sender_id', friend.id)
      .eq('receiver_id', currentUser.id)
      .eq('read', false);
    updateDMUnreadBadge();
    // Send message
    document.getElementById('dm-send-btn').onclick = async () => {
      await sendDMMessage(friend.id);
    };
    document.getElementById('dm-chat-input').addEventListener('keydown', e => {
      if (e.key === 'Enter') sendDMMessage(friend.id);
    });
  }

  // Load DM messages (final fix for .or() filter)
  async function loadDMMessages(friendId) {
    const messagesArea = document.getElementById('dm-messages');
    if (!messagesArea) return;
    // Initialize rendered IDs for this friend if not present
    if (!renderedDMMessageIds[friendId]) renderedDMMessageIds[friendId] = new Set();
    // Correct .or() filter syntax: no outer parentheses
    const filter = `and(sender_id.eq.${currentUser.id},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${currentUser.id})`;
    console.log('DM filter:', filter);
    const { data, error } = await supabase
      .from('direct_messages')
      .select('id, sender_id, receiver_id, content, created_at, read')
      .or(filter)
      .order('created_at', { ascending: true });
    if (error || !data) {
      messagesArea.innerHTML = `<div style=\"color:#e74c3c;text-align:center;margin-top:18px;\">Error: ${error.message}</div>`;
      return;
    }
    // Find all unique user IDs in this DM
    const userIds = new Set();
    data.forEach(msg => {
      userIds.add(msg.sender_id);
      userIds.add(msg.receiver_id);
    });
    // Fetch user info for any IDs not in cache
    const uncachedIds = Array.from(userIds).filter(id => !dmUserCache[id]);
    if (uncachedIds.length > 0) {
      const { data: usersData } = await supabase
        .from('users')
        .select('id, username, avatar_url')
        .in('id', uncachedIds);
      if (usersData) {
        usersData.forEach(u => {
          dmUserCache[u.id] = u;
        });
      }
    }
    // Only append new messages
    let appended = false;
    for (const msg of data) {
      if (!renderedDMMessageIds[friendId].has(msg.id)) {
        const user = dmUserCache[msg.sender_id] || { username: 'Unknown', avatar_url: '' };
      const msgDiv = document.createElement('div');
        msgDiv.className = 'dm-message' + (msg.sender_id === currentUser.id ? ' sent' : ' received');
      msgDiv.innerHTML = `
          <img class=\"friend-avatar\" src=\"${user.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.username)}`}\" alt=\"Avatar\">
          <div class=\"dm-message-content\">
            <div class=\"dm-message-header\">
              <span class=\"dm-message-username\">${user.username}</span>
              <span class=\"dm-message-time\">${new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            <div class=\"dm-message-text\">${msg.content}</div>
          </div>
        `;
        // Add double-click handler for context menu
        msgDiv.ondblclick = function(e) {
          e.preventDefault();
          closeDMContextMenu();
          const menu = document.createElement('div');
          menu.id = 'dm-context-menu';
          menu.style.position = 'fixed';
          menu.style.left = e.clientX + 'px';
          menu.style.top = e.clientY + 'px';
          menu.style.background = '#23272a';
          menu.style.color = '#fff';
          menu.style.borderRadius = '8px';
          menu.style.boxShadow = '0 2px 12px rgba(0,0,0,0.18)';
          menu.style.padding = '6px 0';
          menu.style.zIndex = 9999;
          menu.style.minWidth = '90px';
          menu.style.fontSize = '1rem';
          menu.style.userSelect = 'none';
          // Reply option
          const reply = document.createElement('div');
          reply.textContent = 'Reply';
          reply.style.padding = '7px 18px';
          reply.style.cursor = 'pointer';
          reply.onmouseenter = () => reply.style.background = '#4a90e2';
          reply.onmouseleave = () => reply.style.background = 'none';
          reply.onclick = () => {
            closeDMContextMenu();
            const input = document.getElementById('dm-chat-input');
            if (input) {
              input.value = `@${user.username}: ${msg.content}\n`;
              input.focus();
            }
          };
          // Copy option
          const copy = document.createElement('div');
          copy.textContent = 'Copy';
          copy.style.padding = '7px 18px';
          copy.style.cursor = 'pointer';
          copy.onmouseenter = () => copy.style.background = '#4a90e2';
          copy.onmouseleave = () => copy.style.background = 'none';
          copy.onclick = () => {
            closeDMContextMenu();
            navigator.clipboard.writeText(msg.content);
          };
          menu.appendChild(reply);
          menu.appendChild(copy);
          document.body.appendChild(menu);
          // Close menu on click elsewhere
          setTimeout(() => {
            document.addEventListener('mousedown', closeDMContextMenu, { once: true });
          }, 0);
        };
      messagesArea.appendChild(msgDiv);
        renderedDMMessageIds[friendId].add(msg.id);
        appended = true;
      }
    }
    // Scroll to bottom if new messages were appended
    if (appended) {
      requestAnimationFrame(() => {
    messagesArea.scrollTop = messagesArea.scrollHeight;
      });
    }
    updateDMUnreadBadge();
  }

  // Send DM message
  async function sendDMMessage(friendId) {
    const input = document.getElementById('dm-chat-input');
    if (!input) return;
    const content = input.value.trim();
    if (!content) return;
    input.value = '';
    const { error } = await supabase.from('direct_messages').insert({ sender_id: currentUser.id, receiver_id: friendId, content, read: false });
    if (error) {
      alert('Failed to send message: ' + error.message);
      console.error('DM send error:', error);
      return;
    }
    await loadDMMessages(friendId);
    updateDMUnreadBadge();
  }

  // Emoji picker for DM
  function setupDMEmojiButton() {
    if (!window.EmojiButton) return;
    const emojiBtn = document.querySelector('#dm-emoji-button');
    const chatInput = document.querySelector('#dm-chat-input');
    if (!emojiBtn || !chatInput) return;
    if (emojiBtn._emojiPickerAttached) return;
    emojiBtn._emojiPickerAttached = true;
    const picker = new window.EmojiButton({ theme: 'auto', position: 'top-end', zIndex: 2000 });
    emojiBtn.addEventListener('click', () => {
      picker.togglePicker(emojiBtn);
    });
    picker.on('emoji', emoji => {
      const start = chatInput.selectionStart;
      const end = chatInput.selectionEnd;
      const val = chatInput.value;
      chatInput.value = val.slice(0, start) + emoji + val.slice(end);
      chatInput.focus();
      chatInput.selectionStart = chatInput.selectionEnd = start + emoji.length;
    });
  }

  // Check for unread DMs and show red dot
  async function updateDMUnreadBadge() {
    if (!currentUser) return;
    // Fetch unread DMs (add a 'read' boolean column to direct_messages table)
    const { data, error } = await supabase
      .from('direct_messages')
      .select('id')
      .eq('receiver_id', currentUser.id)
      .eq('read', false);
    let badge = messagesBtn.querySelector('.unread-badge');
    if (data && data.length > 0) {
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'unread-badge';
        badge.textContent = '';
        messagesBtn.appendChild(badge);
      }
    } else {
      if (badge) badge.remove();
    }
  }

  // Call on page load
  updateDMUnreadBadge();

  // --- REALTIME DM BADGE UPDATES ---
  if (supabase.channel) {
    const dmChannel = supabase.channel('realtime:direct_messages')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'direct_messages'
      }, payload => {
        console.log('Realtime DM event:', payload);
        console.log('Current open DM friend:', currentOpenDMFriendId);
        const msg = payload.new || payload.old;
        if (!currentOpenDMFriendId) return;
        if (
          (msg.sender_id === currentUser.id && msg.receiver_id === currentOpenDMFriendId) ||
          (msg.sender_id === currentOpenDMFriendId && msg.receiver_id === currentUser.id)
        ) {
          console.log('Reloading DMs for:', currentOpenDMFriendId);
          loadDMMessages(currentOpenDMFriendId);
        }
        updateDMUnreadBadge();
      })
      .subscribe();
  }

  // Helper to close any open DM context menu
  function closeDMContextMenu() {
    const existingMenu = document.getElementById('dm-context-menu');
    if (existingMenu) existingMenu.remove();
  }

  // Store last opened DM friend in localStorage
  function setLastDMFriendId(friendId) {
    localStorage.setItem('lastDMFriendId', friendId);
  }
  function getLastDMFriendId() {
    return localStorage.getItem('lastDMFriendId');
  }

  // Function to send a message to the selected channel
  async function sendChannelMessage() {
    const input = document.getElementById('chat-input');
    if (!input || !selectedChannelId) return;
    const content = input.value.trim();
    if (!content) return;
    input.value = '';
    const currentUser = getUserSession();
    const { error } = await supabase.from('messages').insert({
      channel_id: selectedChannelId,
      user_id: currentUser.id,
      content,
      created_at: new Date().toISOString()
    });
    if (error) {
      alert('Failed to send message: ' + error.message);
      return;
    }
    await reloadChannelMessages(selectedChannelId);
  }

  // Show a default welcome message in the main panel until the user selects something
  function showDefaultWelcome() {
    if (mainPanel) {
      // Remove any existing welcome message first
      const oldWelcome = document.getElementById('main-welcome-message');
      if (oldWelcome) oldWelcome.remove();
      // Add the welcome message
      const welcomeDiv = document.createElement('div');
      welcomeDiv.id = 'main-welcome-message';
      welcomeDiv.className = 'main-welcome-center';
      welcomeDiv.innerHTML = `
        <div class=\"welcome-animated-icon\" style=\"font-size:4.2rem; color:#43b581;\">💻</div>
        <div class=\"main-welcome-title\">This site is still under development</div>
        <div class=\"main-welcome-desc\">Feel free to use all features, test, and give feedback!<br>More updates are coming soon.</div>
        <div class=\"main-welcome-cta\">Happy Coding! <span style=\"font-size:1.5rem;\">🚀</span></div>
      `;
      mainPanel.appendChild(welcomeDiv);
    }
  }
  showDefaultWelcome();

  function hideDefaultWelcome() {
    const oldWelcome = document.getElementById('main-welcome-message');
    if (oldWelcome) oldWelcome.remove();
  }

  // --- Realtime connection status and polling fallback ---
  let voicePollingInterval = null;
  let voiceRealtimeConnected = true;

  function showVoiceRealtimeWarning(show) {
    let banner = document.getElementById('voice-realtime-warning');
    if (show) {
      if (!banner) {
        banner = document.createElement('div');
        banner.id = 'voice-realtime-warning';
        banner.style.position = 'fixed';
        banner.style.top = '0';
        banner.style.left = '0';
        banner.style.right = '0';
        banner.style.background = '#e74c3c';
        banner.style.color = '#fff';
        banner.style.textAlign = 'center';
        banner.style.padding = '8px 0';
        banner.style.zIndex = '9999';
        banner.style.fontWeight = 'bold';
        banner.textContent = 'Live updates lost, trying to reconnect...';
        document.body.appendChild(banner);
      }
    } else {
      if (banner) banner.remove();
    }
  }

  function startVoicePolling(channelId) {
    if (voicePollingInterval) return;
    voicePollingInterval = setInterval(() => {
      if (typeof fetchVoiceMembers === 'function') fetchVoiceMembers();
    }, 5000);
    showVoiceRealtimeWarning(true);
  }
  function stopVoicePolling() {
    if (voicePollingInterval) {
      clearInterval(voicePollingInterval);
      voicePollingInterval = null;
    }
    showVoiceRealtimeWarning(false);
  }

  if (supabase.realtime && supabase.realtime.on) {
    supabase.realtime.on('open', () => {
      voiceRealtimeConnected = true;
      stopVoicePolling();
    });
    supabase.realtime.on('close', () => {
      voiceRealtimeConnected = false;
      startVoicePolling(selectedChannelId);
    });
    supabase.realtime.on('error', () => {
      voiceRealtimeConnected = false;
      startVoicePolling(selectedChannelId);
    });
  }

  // Helper to check if Supabase realtime is connected
  function isRealtimeConnected() {
    return supabase.realtime && supabase.realtime.socket && supabase.realtime.socket.isConnected();
  }

  // Helper to wait for realtime connection to be ready
  async function waitForRealtimeConnection(retries = 10, delay = 200) {
    for (let i = 0; i < retries; i++) {
      if (isRealtimeConnected()) return true;
      await new Promise(res => setTimeout(res, delay));
    }
    return false;
  }

  // --- Voice Channel UI & Logic ---

  // Add voice channel UI to each channel (Discord-style)
  function createVoiceChannelUI(channelId) {
    const channelElem = document.querySelector(`[data-channel-id="${channelId}"]`);
    if (!channelElem) return;
    let voiceDiv = channelElem.querySelector('.voice-channel-ui');
    if (voiceDiv) return; // Already added

    voiceDiv = document.createElement('div');
    voiceDiv.className = 'voice-channel-ui';
    voiceDiv.innerHTML = `
      <button class="voice-join-btn">🔊 Join Voice</button>
      <button class="voice-leave-btn" style="display:none">🚪 Leave Voice</button>
      <div class="voice-users"></div>
    `;
    channelElem.appendChild(voiceDiv);

    const joinBtn = voiceDiv.querySelector('.voice-join-btn');
    const leaveBtn = voiceDiv.querySelector('.voice-leave-btn');
    const usersDiv = voiceDiv.querySelector('.voice-users');

    let socket, pc, localStream;
    let userId = window.currentUserId || (Math.random() + '').slice(2);
    let userName = window.currentUserName || 'You';
    let userAvatar = window.currentUserAvatar || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(userName);
    let peers = {};

    function updateVoiceUsers(users) {
      usersDiv.innerHTML = '';
      users.forEach(u => {
        const userEl = document.createElement('div');
        userEl.className = 'voice-user';
        userEl.innerHTML = `
          <img src="${u.avatar}" class="voice-avatar" />
          <span class="voice-name">${u.name}</span>
          <span class="voice-mic" data-id="${u.id}">🎤</span>
        `;
        usersDiv.appendChild(userEl);
      });
    }

    let voiceUsers = [];

    function addVoiceUser(u) {
      if (!voiceUsers.find(x => x.id === u.id)) {
        voiceUsers.push(u);
        updateVoiceUsers(voiceUsers);
      }
    }
    function removeVoiceUser(id) {
      voiceUsers = voiceUsers.filter(u => u.id !== id);
      updateVoiceUsers(voiceUsers);
    }

    async function setupConnection() {
      pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });
      localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
      pc.onicecandidate = (e) => {
        if (e.candidate) {
          socket.send(JSON.stringify({ type: 'signal', candidate: e.candidate, room: channelId }));
        }
      };
      pc.ontrack = (e) => {
        let audio = document.querySelector(`audio[data-peer="${e.streams[0].id}"]`);
        if (!audio) {
          audio = document.createElement('audio');
          audio.dataset.peer = e.streams[0].id;
          audio.autoplay = true;
          audio.className = 'voice-audio';
          usersDiv.appendChild(audio);
        }
        audio.srcObject = e.streams[0];
      };
    }

    joinBtn.onclick = async () => {
      console.log('[Voice] Join button clicked for channel:', channelId, userId, userName);
      socket = new WebSocket('ws://localhost:3000');
      socket.onopen = () => {
        console.log('[Voice] WebSocket opened, sending join', { room: channelId, id: userId, name: userName, avatar: userAvatar });
        socket.send(JSON.stringify({ type: 'join', room: channelId, id: userId, name: userName, avatar: userAvatar }));
      };
      socket.onmessage = async (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'user_list_update') {
          console.log('[Voice] Received user_list_update event:', data.users);
          // Update the full user list live
          voiceUsers = data.users;
          updateVoiceUsers(voiceUsers);
          // Reload the main panel for the voice channel
          if (selectedChannelId === channelId && lastSelectedChannel && lastSelectedServerName) {
            console.log('[Voice] Reloading main panel for voice channel', channelId);
            showChannelContent(lastSelectedChannel, lastSelectedServerName);
          }
        }
        if (data.type === 'offer') {
          await setupConnection();
          await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.send(JSON.stringify({ type: 'signal', answer: pc.localDescription, room: channelId }));
        }
        if (data.type === 'answer') {
          await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
        }
        if (data.type === 'candidate') {
          await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        }
      };
      await setupConnection();
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.send(JSON.stringify({ type: 'signal', offer: pc.localDescription, room: channelId }));
      addVoiceUser({ id: userId, name: userName, avatar: userAvatar });
      joinBtn.style.display = 'none';
      leaveBtn.style.display = '';
    };

    leaveBtn.onclick = () => {
      if (socket && socket.readyState === 1) {
        socket.send(JSON.stringify({ type: 'leave', room: channelId, id: userId }));
        socket.close();
      }
      if (pc) pc.close();
      if (localStream) localStream.getTracks().forEach(t => t.stop());
      removeVoiceUser(userId);
      joinBtn.style.display = '';
      leaveBtn.style.display = 'none';
      // Remove peer audio elements
      usersDiv.querySelectorAll('audio').forEach(a => a.remove());
    };
  }

  // Add voice UI to all channels on page load (adjust selector as needed)
  document.querySelectorAll('[data-channel-id]').forEach(ch => {
    const id = ch.getAttribute('data-channel-id');
    createVoiceChannelUI(id);
  });

  // --- Voice Channel UI CSS (add to style.css for Discord look) ---
  // .voice-channel-ui { background: #23272a; padding: 8px; border-radius: 8px; margin-top: 8px; }
  // .voice-join-btn, .voice-leave-btn { background: #5865f2; color: #fff; border: none; border-radius: 4px; margin-right: 8px; padding: 6px 12px; cursor: pointer; }
  // .voice-users { display: flex; gap: 8px; margin-top: 8px; }
  // .voice-user { display: flex; align-items: center; background: #2c2f33; border-radius: 4px; padding: 2px 8px; }
  // .voice-avatar { width: 24px; height: 24px; border-radius: 50%; margin-right: 6px; }
  // .voice-name { color: #fff; margin-right: 4px; font-size: 14px; }
  // .voice-mic { color: #43b581; font-size: 16px; }

  // Helper to update the main panel's voice user grid live
  function updateMainVoicePanel(users) {
    const mainPanel = document.querySelector('.main-panel');
    if (!mainPanel) return;
    // Only update if the main panel is showing the voice channel grid
    const grid = mainPanel.querySelector('.voice-users-grid');
    if (!grid) return;
    grid.innerHTML = users.map(u => `
      <div class="voice-user-tile">
        <img class="voice-user-avatar" src="${u.avatar}" alt="Avatar">
        <div class="voice-user-label">
          <i class="fa fa-microphone" style="margin-right:6px;color:#43b581;"></i>
          ${u.name}
        </div>
      </div>
    `).join('');
    // Adjust grid class for single/two users
    grid.classList.remove('single-user', 'two-users');
    if (users.length === 1) grid.classList.add('single-user');
    else if (users.length === 2) grid.classList.add('two-users');
  }

  // Helper to re-render the full main panel for the voice channel
  function renderMainVoicePanelFull(users) {
    const mainPanel = document.querySelector('.main-panel');
    if (!mainPanel) return;
    // Only update if the main panel is showing the voice channel grid
    const grid = mainPanel.querySelector('.voice-users-grid');
    if (!grid) return;
    // Re-render the full panel (header, grid, controls)
    const header = `
      <div class="main-chat-header">
        <span class="main-chat-header-hash"><i class='fa fa-volume-up'></i></span>
        <span class="main-chat-header-name">Voice Channel</span>
      </div>
    `;
    const gridHtml = `
      <div class="voice-main-content voice-users-grid">
        ${users.map(u => `
          <div class="voice-user-tile">
            <img class="voice-user-avatar" src="${u.avatar}" alt="Avatar">
            <div class="voice-user-label">
              <i class="fa fa-microphone" style="margin-right:6px;color:#43b581;"></i>
              ${u.name}
            </div>
          </div>
        `).join('')}
      </div>
    `;
    const controls = `
      <div class="voice-controls-bar">
        <button class="voice-control-btn voice-leave-btn" id="voice-leave-btn" title="Leave Call"><i class="fa fa-phone"></i></button>
      </div>
    `;
    mainPanel.innerHTML = header + gridHtml + controls;
    // Adjust grid class for single/two users
    const gridDiv = mainPanel.querySelector('.voice-users-grid');
    if (gridDiv) {
      gridDiv.classList.remove('single-user', 'two-users');
      if (users.length === 1) gridDiv.classList.add('single-user');
      else if (users.length === 2) gridDiv.classList.add('two-users');
    }
    // Re-attach leave button event
    const leaveBtn = mainPanel.querySelector('#voice-leave-btn');
    if (leaveBtn) {
      leaveBtn.onclick = () => {
        if (socket && socket.readyState === 1) {
          socket.send(JSON.stringify({ type: 'leave', room: channelId, id: userId }));
          socket.close();
        }
        if (pc) pc.close();
        if (localStream) localStream.getTracks().forEach(t => t.stop());
        removeVoiceUser(userId);
        // Remove peer audio elements
        const usersDiv = document.querySelector('.voice-users');
        if (usersDiv) usersDiv.querySelectorAll('audio').forEach(a => a.remove());
        // Optionally, clear main panel
        mainPanel.innerHTML = '<div class="main-voice-center-msg">You left the voice channel.</div>';
      };
    }
  }

  // --- Voice Channel WebSocket Logic ---
  let voiceWebSocket = null;
  let voiceMembers = [];
  let hasJoined = false;

  async function joinVoiceChannel(selectedChannel, currentUser) {
    if (hasJoined) return;
    hasJoined = true;

    // Remove any existing connection
    if (voiceWebSocket) {
      voiceWebSocket.close();
      voiceWebSocket = null;
    }

    // Connect to WebSocket server
    voiceWebSocket = new WebSocket(`ws://${window.location.host}`);

    // On open, send join message
    voiceWebSocket.onopen = () => {
      voiceWebSocket.send(JSON.stringify({
        type: 'join',
        userId: currentUser.id,
        room: selectedChannel.id
      }));
    };

    // Listen for updates
    voiceWebSocket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'user_list_update' && data.room === selectedChannel.id) {
        // Update voice members list
        voiceMembers = data.users.map(uid => ({
          user_id: uid,
          muted: false,
          users: channelUserCache[uid] || { username: 'Unknown', avatar_url: '' }
        }));
        renderVoiceMembers();
      }
    };

    // Cleanup on close
    voiceWebSocket.onclose = () => {
      console.log('WebSocket closed');
      voiceWebSocket = null;
    };
  }

  async function leaveVoiceChannel(selectedChannel, currentUser) {
    hasJoined = false;
    if (voiceWebSocket) {
      voiceWebSocket.send(JSON.stringify({
        type: 'leave',
        userId: currentUser.id,
        room: selectedChannel.id
      }));
      voiceWebSocket.close();
      voiceWebSocket = null;
    }
    // Optionally clear UI
    voiceMembers = [];
    renderVoiceMembers();
  }

  // Replace all Supabase-based voice channel member logic with the above WebSocket logic.
  // Call joinVoiceChannel(selectedChannel, currentUser) when a user joins a voice channel.
  // Call leaveVoiceChannel(selectedChannel, currentUser) when a user leaves a voice channel.
});

// Add CSS for animation at the end of the file if not present
const style = document.createElement('style');
style.innerHTML = `
.welcome-animated-icon {
  margin-bottom: 24px;
  animation: welcome-bounce 2.2s infinite cubic-bezier(.68,-0.55,.27,1.55);
  will-change: transform;
}
@keyframes welcome-bounce {
  0%, 100% { transform: scale(1) translateY(0); }
  10% { transform: scale(1.08, 0.92) translateY(-6px); }
  20% { transform: scale(0.95, 1.05) translateY(2px); }
  30% { transform: scale(1.04, 0.96) translateY(-4px); }
  50% { transform: scale(1.02, 1.02) translateY(0); }
  70% { transform: scale(0.98, 1.04) translateY(2px); }
  90% { transform: scale(1.01, 0.99) translateY(-2px); }
}
.main-welcome-center .main-welcome-title {
  font-size: 2.3rem;
  color: #fff;
  font-weight: 900;
  margin-bottom: 10px;
  letter-spacing: 0.01em;
  text-shadow: 0 2px 18px #23272a88;
}
.main-welcome-center .main-welcome-desc {
  color: #b9bbbe;
  font-size: 1.18rem;
  margin-bottom: 22px;
  line-height: 1.6;
}
.main-welcome-center .main-welcome-cta {
  color: #43b581;
  font-size: 1.25rem;
  font-weight: 700;
  margin-top: 8px;
  letter-spacing: 0.01em;
  animation: welcome-glow 2.5s infinite alternate;
}
@keyframes welcome-glow {
  0% { text-shadow: 0 0 8px #43b58144, 0 0 0 #fff; }
  100% { text-shadow: 0 0 24px #43b581cc, 0 0 8px #fff; }
}
`;
document.head.appendChild(style); 