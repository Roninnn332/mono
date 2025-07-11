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

// Add global to track last selected channel and server name
let lastSelectedChannel = null;
let lastSelectedServerName = null;

// Add these for DM realtime and polling management
let dmRealtimeSubscription = null;
let dmPollingInterval = null;

// --- Emoji Picker Integration (using emoji-api.com) ---
// Add global emoji cache
let emojiCache = null;
let emojiCategories = null;
let emojiCategoryMap = {};
let emojiPickerOverlay = null;
let emojiPickerPanel = null;
let emojiSearchInput = null;
let emojiGrid = null;
let emojiCategoryRow = null;
let emojiPickerActiveInput = null;
const EMOJI_API_KEY = '7b187d4be217627998c36af54a1e716657f37cf9';

// Fetch all emojis and categories (cache in memory)
async function fetchAllEmojis() {
  if (emojiCache) return emojiCache;
  const res = await fetch(`https://emoji-api.com/emojis?access_key=${EMOJI_API_KEY}`);
  emojiCache = await res.json();
  return emojiCache;
}
async function fetchCategories() {
  if (emojiCategories) return emojiCategories;
  const res = await fetch(`https://emoji-api.com/categories?access_key=${EMOJI_API_KEY}`);
  emojiCategories = await res.json();
  return emojiCategories;
}
// Build category map for fast lookup
async function buildCategoryMap() {
  if (Object.keys(emojiCategoryMap).length) return emojiCategoryMap;
  const emojis = await fetchAllEmojis();
  for (const emoji of emojis) {
    if (!emojiCategoryMap[emoji.group]) emojiCategoryMap[emoji.group] = [];
    emojiCategoryMap[emoji.group].push(emoji);
  }
  return emojiCategoryMap;
}
// Show emoji picker popup
function showEmojiPicker(inputEl, anchorBtn) {
  if (!emojiPickerOverlay) createEmojiPickerDOM();
  emojiPickerActiveInput = inputEl;
  emojiPickerOverlay.classList.add('active');
  loadEmojiCategories();
  loadEmojiGrid('', null, anchorBtn); // Pass anchorBtn to loadEmojiGrid
  emojiSearchInput.value = '';
  emojiSearchInput.focus();
}
function hideEmojiPicker() {
  if (emojiPickerOverlay) emojiPickerOverlay.classList.remove('active');
  emojiPickerActiveInput = null;
}
function createEmojiPickerDOM() {
  emojiPickerOverlay = document.createElement('div');
  emojiPickerOverlay.className = 'emoji-picker-overlay';
  emojiPickerOverlay.innerHTML = `
    <div class="emoji-picker" tabindex="-1" style="position:relative;visibility:hidden;">
      <div class="emoji-picker-search-row">
        <input class="emoji-picker-search" type="text" placeholder="Search emojis..." />
        <button class="emoji-picker-close" title="Close">&times;</button>
      </div>
      <div class="emoji-picker-categories"></div>
      <div class="emoji-picker-grid"></div>
    </div>
  `;
  document.body.appendChild(emojiPickerOverlay);
  emojiPickerPanel = emojiPickerOverlay.querySelector('.emoji-picker');
  emojiSearchInput = emojiPickerOverlay.querySelector('.emoji-picker-search');
  emojiGrid = emojiPickerOverlay.querySelector('.emoji-picker-grid');
  emojiCategoryRow = emojiPickerOverlay.querySelector('.emoji-picker-categories');
  // Close logic
  emojiPickerOverlay.querySelector('.emoji-picker-close').onclick = hideEmojiPicker;
  emojiPickerOverlay.onclick = e => {
    if (e.target === emojiPickerOverlay) hideEmojiPicker();
  };
  emojiSearchInput.oninput = () => loadEmojiGrid(emojiSearchInput.value.trim());
}
async function loadEmojiCategories() {
  const cats = await fetchCategories();
  emojiCategoryRow.innerHTML = '';
  cats.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = 'emoji-picker-category-btn';
    btn.textContent = categoryIcon(cat.slug);
    btn.title = cat.slug.replace(/-/g, ' ');
    btn.onclick = () => {
      document.querySelectorAll('.emoji-picker-category-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      loadEmojiGrid('', cat.slug);
    };
    emojiCategoryRow.appendChild(btn);
  });
  // Select first by default
  if (emojiCategoryRow.firstChild) emojiCategoryRow.firstChild.classList.add('selected');
}
function categoryIcon(slug) {
  // Simple icons for main categories
  const icons = {
    'smileys-emotion': '😃',
    'people-body': '🧑',
    'animals-nature': '🐻',
    'food-drink': '🍔',
    'travel-places': '🌍',
    'activities': '⚽',
    'objects': '💡',
    'symbols': '❤️',
    'flags': '🏳️',
    'component': '🧩',
  };
  return icons[slug] || '❓';
}

// Move this to the top-level scope:
function positionEmojiPicker(anchorBtn) {
  if (!emojiPickerPanel || !anchorBtn) return;
  // Default: center of screen (fallback)
  emojiPickerPanel.style.position = 'fixed';
  emojiPickerPanel.style.left = '50%';
  emojiPickerPanel.style.top = '50%';
  emojiPickerPanel.style.transform = 'translate(-50%, -50%)';
  // Try to position near anchorBtn
  try {
    const rect = anchorBtn.getBoundingClientRect();
    const panelRect = emojiPickerPanel.getBoundingClientRect();
    let left = rect.left + window.scrollX;
    let top = rect.bottom + 8 + window.scrollY;
    // If picker would overflow right, shift left
    if (left + panelRect.width > window.innerWidth - 12) {
      left = window.innerWidth - panelRect.width - 12;
    }
    // If picker would overflow bottom, shift up
    if (top + panelRect.height > window.innerHeight - 12) {
      top = rect.top - panelRect.height - 8 + window.scrollY;
      if (top < 0) top = 12;
    }
    emojiPickerPanel.style.left = left + 'px';
    emojiPickerPanel.style.top = top + 'px';
    emojiPickerPanel.style.transform = 'none';
  } catch (e) {
    // fallback to center
    emojiPickerPanel.style.left = '50%';
    emojiPickerPanel.style.top = '50%';
    emojiPickerPanel.style.transform = 'translate(-50%, -50%)';
  }
}

// Add this at the top level:
async function loadEmojiGrid(search = '', category = null, anchorBtn = null) {
  emojiGrid.innerHTML = '<div style="color:#aaa;font-size:1.1rem;padding:12px 0;">Loading...</div>';
  let emojis = await fetchAllEmojis();
  if (category) {
    emojis = emojis.filter(e => e.group === category);
  }
  if (search) {
    const s = search.toLowerCase();
    emojis = emojis.filter(e => e.unicodeName.toLowerCase().includes(s) || e.slug.includes(s));
  }
  // Limit to 300 for performance
  emojis = emojis.slice(0, 300);
  if (!emojis.length) {
    emojiGrid.innerHTML = '<div style="color:#aaa;font-size:1.1rem;padding:12px 0;">No emojis found.</div>';
    if (anchorBtn) positionEmojiPicker(anchorBtn);
    if (emojiPickerPanel) emojiPickerPanel.style.visibility = 'visible';
    return;
  }
  emojiGrid.innerHTML = '';
  emojis.forEach(emoji => {
    const btn = document.createElement('button');
    btn.className = 'emoji-picker-emoji';
    btn.textContent = emoji.character;
    btn.title = emoji.unicodeName;
    btn.onclick = () => {
      insertEmojiAtCursor(emojiPickerActiveInput, emoji.character);
      hideEmojiPicker();
    };
    emojiGrid.appendChild(btn);
  });
  if (anchorBtn) positionEmojiPicker(anchorBtn);
  if (emojiPickerPanel) emojiPickerPanel.style.visibility = 'visible';
}

// Add this at the top level:
function insertEmojiAtCursor(input, emoji) {
  if (!input) return;
  const start = input.selectionStart;
  const end = input.selectionEnd;
  const val = input.value;
  input.value = val.slice(0, start) + emoji + val.slice(end);
  input.focus();
  input.selectionStart = input.selectionEnd = start + emoji.length;
}

document.addEventListener('DOMContentLoaded', function() {
  // Global error handler for unhandled promise rejections
  window.addEventListener('unhandledrejection', function(event) {
    if (event.reason && event.reason.message) {
      console.error('Global Unhandled Promise Rejection:', event.reason.message, event.reason);
    } else {
      console.error('Global Unhandled Promise Rejection:', event);
    }
  });

  // Preload emojis and categories for instant emoji picker
  fetchAllEmojis();
  fetchCategories();

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
        btn.dataset.serverId = server.id;
        btn.addEventListener('click', async () => {
          setSelectedServer(server.id);
          await updateCreateChannelBtn(server.id);
          // Update selected state
          document.querySelectorAll('.servers .server-btn').forEach(b => b.classList.remove('selected'));
          btn.classList.add('selected');
        });
        document.querySelector('.servers').insertBefore(btn, document.querySelector('.server-separator'));
      });
    }
    // After loading, set selected class on the current server
    if (window.selectedServerId) {
      const activeBtn = document.querySelector(`.servers .server-btn[data-server-id="${window.selectedServerId}"]`);
      if (activeBtn) activeBtn.classList.add('selected');
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
  const profileLogoutBtn = document.getElementById('profile-logout-btn');

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
    // Hide friends list panel and sidebar tabs when switching to a server
    if (typeof friendsListPanel !== 'undefined') friendsListPanel.style.display = 'none';
    if (typeof sidebarTabs !== 'undefined') sidebarTabs.style.display = 'none';
    selectedServerId = serverId;
    // Hide join-server UI
    if (sidebarTabs) sidebarTabs.style.display = 'none';
    if (addFriendPanel) addFriendPanel.style.display = 'none';
    // Show channels list
    document.querySelectorAll('.channels .channel-btn, .channels .channel-heading').forEach(btn => btn.style.display = '');
    // Show create channel button
    const createChannelBtn = document.querySelector('.create-channel-btn');
    if (createChannelBtn) createChannelBtn.style.display = '';
    loadChannels(serverId, true);
    // Update selected state for server buttons
    document.querySelectorAll('.servers .server-btn').forEach(btn => {
      if (btn.dataset.serverId === serverId) {
        btn.classList.add('selected');
      } else {
        btn.classList.remove('selected');
      }
    });
    window.selectedServerId = serverId;
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
          btn.setAttribute('data-voice-channel-id', channel.id);
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
    const currentUser = getUserSession();

    // If current user is null, make sure we return early or handle authentication
    if (!currentUser) {
        console.error("User not authenticated.");
        return;
    }

    if (selectedChannel && selectedChannel.type === 'text') {
      // If a voice channel was previously joined, leave it
      if (hasJoined) {
        await leaveVoiceChannel(lastSelectedChannel, currentUser); // Pass correct channel/user
      }

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
        // Show normal chat area with search icon in header
        mainPanel.innerHTML = `
          <div class="main-chat-header" id="main-chat-header">
            <span class="main-chat-header-hash">#</span>
            <span class="main-chat-header-name">${selectedChannel.name}</span>
            <div class="chat-header-search-area" id="chat-header-search-area">
              <button id="chat-search-toggle" class="chat-search-toggle" title="Search Messages"><i class="fa fa-search"></i></button>
              <div class="chat-search-bar" id="chat-search-bar">
                <button id="chat-search-close" class="chat-search-close" title="Close Search"><i class="fa fa-times"></i></button>
                <input id="chat-search-input" class="chat-search-input" type="text" placeholder="Search messages..." autocomplete="off" />
                <button id="chat-search-prev" class="chat-search-nav"><i class="fa fa-chevron-up"></i></button>
                <button id="chat-search-next" class="chat-search-nav"><i class="fa fa-chevron-down"></i></button>
                <span id="chat-search-count" class="chat-search-count"></span>
              </div>
            </div>
          </div>
          <div class="main-chat-flex-col">
            <div class="main-chat-messages" id="main-chat-messages">
            ${messages.map(msg => {
              const user = channelUserCache[msg.user_id] || { username: 'Unknown', avatar_url: '' };
              return `<div class=\"dm-message\">\n  <img class=\"friend-avatar\" src=\"${user.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.username)}`}\" alt=\"Avatar\">\n  <div class=\"dm-message-content\">\n    <div class=\"dm-message-text main-chat-message-text\">${msg.content}</div>\n  </div>\n</div>`;
            }).join('')}
            </div>
            <div class="main-chat-input-row">
              <button class="main-input-icon main-input-media" title="Send Media"><i class="fa fa-paperclip"></i></button>
              <input class="main-chat-input" id="chat-input" type="text" placeholder="Message #${selectedChannel.name}" autocomplete="off" autocorrect="off" spellcheck="false" />
              <button id="emoji-button" class="main-input-icon" title="Emoji Picker">😊</button>
              <button class="main-chat-send"><i class="fa fa-paper-plane"></i></button>
            </div>
          </div>
        `;
      // Search bar expand/collapse logic
      const searchToggle = document.getElementById('chat-search-toggle');
      const searchBar = document.getElementById('chat-search-bar');
      const searchInput = document.getElementById('chat-search-input');
      const searchPrev = document.getElementById('chat-search-prev');
      const searchNext = document.getElementById('chat-search-next');
      const searchCount = document.getElementById('chat-search-count');
      const searchClose = document.getElementById('chat-search-close');
      const messagesDiv = document.getElementById('main-chat-messages');
      let searchMatches = [];
      let currentMatch = 0;
      function clearHighlights() {
        messagesDiv.querySelectorAll('.chat-search-highlight').forEach(el => {
          const parent = el.parentNode;
          parent.replaceChild(document.createTextNode(el.textContent), el);
          parent.normalize();
        });
      }
      function highlightMatches(query) {
        clearHighlights();
        if (!query) return [];
        const matches = [];
        messagesDiv.querySelectorAll('.main-chat-message-text').forEach((msgDiv, idx) => {
          const text = msgDiv.textContent;
          const regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
          let match;
          let lastIndex = 0;
          let html = '';
          let found = false;
          while ((match = regex.exec(text)) !== null) {
            found = true;
            html += text.slice(lastIndex, match.index);
            html += `<span class='chat-search-highlight'>${match[0]}</span>`;
            lastIndex = match.index + match[0].length;
            matches.push({msgDiv, idx, matchIndex: match.index});
          }
          html += text.slice(lastIndex);
          if (found) msgDiv.innerHTML = html;
        });
        return matches;
      }
      function updateSearchNav() {
        if (!searchMatches.length) {
          searchCount.textContent = '';
          return;
        }
        searchMatches.forEach((m, i) => {
          const el = m.msgDiv.querySelectorAll('.chat-search-highlight')[0];
          if (el) el.classList.toggle('current', i === currentMatch);
        });
        searchCount.textContent = `${searchMatches.length ? (currentMatch+1) : 0}/${searchMatches.length}`;
        // Scroll to current match
        if (searchMatches.length) {
          // The message bubble is .dm-message, not .main-chat-message
          const el = searchMatches[currentMatch].msgDiv.closest('.dm-message');
          if (el) el.scrollIntoView({behavior:'smooth', block:'center'});
        }
      }
      function doSearch() {
        const query = searchInput.value.trim();
        searchMatches = highlightMatches(query);
        currentMatch = 0;
        updateSearchNav();
      }
      if (searchToggle && searchBar && searchInput) {
        searchToggle.onclick = () => {
          searchBar.classList.add('active');
          searchToggle.style.display = 'none';
          setTimeout(() => searchInput.focus(), 180);
        };
        searchClose.onclick = () => {
          searchBar.classList.remove('active');
          setTimeout(() => {
            searchToggle.style.display = '';
            searchInput.value = '';
            clearHighlights();
            searchCount.textContent = '';
          }, 220);
        };
        searchInput.addEventListener('keydown', e => {
          if (e.key === 'Escape') searchClose.click();
        });
      }
      searchInput.addEventListener('input', doSearch);
      searchPrev.addEventListener('click', () => {
        if (!searchMatches.length) return;
        currentMatch = (currentMatch - 1 + searchMatches.length) % searchMatches.length;
        updateSearchNav();
      });
      searchNext.addEventListener('click', () => {
        if (!searchMatches.length) return;
        currentMatch = (currentMatch + 1) % searchMatches.length;
        updateSearchNav();
      });
      searchInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          if (searchMatches.length) {
            currentMatch = (currentMatch + 1) % searchMatches.length;
            updateSearchNav();
          }
        }
      });
      // Clear highlights when search is cleared
      searchInput.addEventListener('blur', () => {
        if (!searchInput.value.trim()) clearHighlights();
      });
      // Scroll to bottom
      setTimeout(() => {
        if (messagesDiv) messagesDiv.scrollTop = messagesDiv.scrollHeight;
      }, 120);
      // Attach send button and Enter key for sending messages
      const sendBtn = document.querySelector('.main-chat-send');
      const chatInput = document.getElementById('chat-input');
      if (sendBtn && chatInput) {
        sendBtn.onclick = sendChannelMessage;
        chatInput.addEventListener('keydown', e => {
          if (e.key === 'Enter') sendChannelMessage();
        });
      }
      // --- Realtime subscription for text channel ---
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
            if (selectedChannelId === selectedChannel.id) {
              reloadChannelMessages(selectedChannel.id);
            }
          })
          .subscribe();
        currentRealtimeChannelId = selectedChannel.id;
      }
    } else if (selectedChannel && selectedChannel.type === 'voice') {
      // If a text channel was previously selected, clear its subscription
      if (channelRealtimeSubscription) {
          supabase.removeChannel(channelRealtimeSubscription);
          channelRealtimeSubscription = null;
          currentRealtimeChannelId = null;
      }

      // Voice Channel UI rendering (no database queries for presence)
      // This will be updated by WebSocket messages
      mainPanel.innerHTML = `
        <div class="main-chat-header">
          <span class="main-chat-header-hash"><i class='fa fa-volume-up'></i></span>
          <span class="main-chat-header-name">${selectedChannel.name}</span>
        </div>
        <div class="voice-main-content voice-users-grid" id="voice-users-grid">
          <!-- Voice members will be rendered here by renderVoiceMembers() -->
                  </div>
          <div class="voice-controls-bar">
          <button class="voice-control-btn" id="voice-mute-btn" title="Mute/Unmute" style="display:none;"><i class="fa fa-microphone-slash"></i></button>
            <button class="voice-control-btn" id="voice-deafen-btn" title="Deafen (not implemented)"><i class="fa fa-headphones"></i></button>
            <button class="voice-control-btn" id="voice-screenshare-btn" title="Screen Share (coming soon)" disabled><i class="fa fa-desktop"></i></button>
            <button class="voice-control-btn" id="voice-more-btn" title="More"><i class="fa fa-ellipsis-h"></i></button>
          <button class="voice-control-btn voice-leave-btn" id="voice-leave-btn" title="Leave Call" style="display:none;"><i class="fa fa-phone"></i></button>
          <button class="voice-control-btn voice-join-btn" id="voice-join-btn" title="Join Call"><i class="fa fa-phone-square"></i> Join Voice</button>
          </div>
        `;

      // Attach event listeners for voice controls
      document.getElementById('voice-join-btn').onclick = () => {
          joinVoiceChannel(selectedChannel, currentUser);
          document.getElementById('voice-join-btn').style.display = 'none';
          document.getElementById('voice-leave-btn').style.display = '';
          document.getElementById('voice-mute-btn').style.display = ''; // Show mute button when joined
      };
      document.getElementById('voice-leave-btn').onclick = () => {
          leaveVoiceChannel(selectedChannel, currentUser);
          document.getElementById('voice-join-btn').style.display = '';
          document.getElementById('voice-leave-btn').style.display = 'none';
          document.getElementById('voice-mute-btn').style.display = 'none'; // Hide mute button when left
      };
        document.getElementById('voice-mute-btn').onclick = toggleMute;
        document.getElementById('voice-deafen-btn').onclick = () => alert('Deafen coming soon!');
        document.getElementById('voice-screenshare-btn').onclick = () => alert('Screen share coming soon!');
        document.getElementById('voice-more-btn').onclick = () => alert('More options coming soon!');

      // Initial render of voice members (will likely be empty until WebSocket update)
      renderVoiceMembers();

      // If already joined a voice channel and switching to another voice channel, leave the old one first
      if (hasJoined && voiceWebSocket && voiceWebSocket.readyState === WebSocket.OPEN && voiceWebSocket.room !== selectedChannel.id) {
          await leaveVoiceChannel(lastSelectedChannel, currentUser); // Leave the previously joined channel
      }

      // Automatically join the voice channel when selecting it, if not already joined
      if (!hasJoined || voiceWebSocket.room !== selectedChannel.id) {
          await joinVoiceChannel(selectedChannel, currentUser);
          document.getElementById('voice-join-btn').style.display = 'none';
          document.getElementById('voice-leave-btn').style.display = '';
          document.getElementById('voice-mute-btn').style.display = '';
      }
    }
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
        return `<div class=\"dm-message\">\n  <img class=\"friend-avatar\" src=\"${user.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.username)}`}\" alt=\"Avatar\">\n  <div class=\"dm-message-content\">\n    <div class=\"dm-message-text main-chat-message-text\">${msg.content}</div>\n  </div>\n</div>`;
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
      // Check if code is a valid UUID format (assuming server IDs are UUIDs)
      const isValidUUID = (uuid) => {
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid);
      };
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
  async function openDMChat(friend) {
    hideDefaultWelcome();
    currentOpenDMFriendId = friend.id;
    setLastDMFriendId(friend.id);
    renderedDMMessageIds[friend.id] = new Set();
    while (mainPanel.firstChild) mainPanel.removeChild(mainPanel.firstChild);
    // Header with search
    const header = document.createElement('div');
    header.className = 'main-chat-header';
    header.innerHTML = `
      <img src="${friend.avatar_url}" class="friend-avatar" style="width:36px;height:36px;margin-right:10px;">
      <span class="main-chat-header-name">${friend.username}</span>
      <span style="color:#4a90e2;font-size:1.05rem;margin-left:8px;">#${friend.friend_code}</span>
      <div class="chat-header-search-area" id="dm-chat-header-search-area">
        <button id="dm-chat-search-toggle" class="chat-search-toggle" title="Search Messages"><i class="fa fa-search"></i></button>
        <div class="chat-search-bar" id="dm-chat-search-bar">
          <button id="dm-chat-search-close" class="chat-search-close" title="Close Search"><i class="fa fa-times"></i></button>
          <input id="dm-chat-search-input" class="chat-search-input" type="text" placeholder="Search messages..." autocomplete="off" />
          <button id="dm-chat-search-prev" class="chat-search-nav"><i class="fa fa-chevron-up"></i></button>
          <button id="dm-chat-search-next" class="chat-search-nav"><i class="fa fa-chevron-down"></i></button>
          <span id="dm-chat-search-count" class="chat-search-count"></span>
        </div>
      </div>
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
      <button id="emoji-button" class="main-input-icon" title="Emoji Picker">😊</button>
      <button class="main-chat-send" id="dm-send-btn"><i class="fa fa-paper-plane"></i></button>
    `;
    mainPanel.appendChild(inputRow);
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
    // --- DM SEARCH LOGIC ---
    const searchToggle = document.getElementById('dm-chat-search-toggle');
    const searchBar = document.getElementById('dm-chat-search-bar');
    const searchInput = document.getElementById('dm-chat-search-input');
    const searchPrev = document.getElementById('dm-chat-search-prev');
    const searchNext = document.getElementById('dm-chat-search-next');
    const searchCount = document.getElementById('dm-chat-search-count');
    const searchClose = document.getElementById('dm-chat-search-close');
    const messagesDiv = document.getElementById('dm-messages');
    let searchMatches = [];
    let currentMatch = 0;
    function clearHighlights() {
      messagesDiv.querySelectorAll('.chat-search-highlight').forEach(el => {
        const parent = el.parentNode;
        parent.replaceChild(document.createTextNode(el.textContent), el);
        parent.normalize();
      });
    }
    function highlightMatches(query) {
      clearHighlights();
      if (!query) return [];
      const matches = [];
      messagesDiv.querySelectorAll('.main-chat-message-text').forEach((msgDiv, idx) => {
        const text = msgDiv.textContent;
        const regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        let match;
        let lastIndex = 0;
        let html = '';
        let found = false;
        while ((match = regex.exec(text)) !== null) {
          found = true;
          html += text.slice(lastIndex, match.index);
          html += `<span class='chat-search-highlight'>${match[0]}</span>`;
          lastIndex = match.index + match[0].length;
          matches.push({msgDiv, idx, matchIndex: match.index});
        }
        html += text.slice(lastIndex);
        if (found) msgDiv.innerHTML = html;
      });
      return matches;
    }
    function updateSearchNav() {
      if (!searchMatches.length) {
        searchCount.textContent = '';
        return;
      }
      searchMatches.forEach((m, i) => {
        const el = m.msgDiv.querySelectorAll('.chat-search-highlight')[0];
        if (el) el.classList.toggle('current', i === currentMatch);
      });
      searchCount.textContent = `${searchMatches.length ? (currentMatch+1) : 0}/${searchMatches.length}`;
      // Scroll to current match
      if (searchMatches.length) {
        const el = searchMatches[currentMatch].msgDiv.closest('.dm-message');
        if (el) el.scrollIntoView({behavior:'smooth', block:'center'});
      }
    }
    function doSearch() {
      const query = searchInput.value.trim();
      searchMatches = highlightMatches(query);
      currentMatch = 0;
      updateSearchNav();
    }
    if (searchToggle && searchBar && searchInput) {
      searchToggle.onclick = () => {
        searchBar.classList.add('active');
        searchToggle.style.display = 'none';
        setTimeout(() => searchInput.focus(), 180);
      };
      searchClose.onclick = () => {
        searchBar.classList.remove('active');
        setTimeout(() => {
          searchToggle.style.display = '';
          searchInput.value = '';
          clearHighlights();
          searchCount.textContent = '';
        }, 220);
      };
      searchInput.addEventListener('keydown', e => {
        if (e.key === 'Escape') searchClose.click();
      });
    }
    searchInput.addEventListener('input', doSearch);
    searchPrev.addEventListener('click', () => {
      if (!searchMatches.length) return;
      currentMatch = (currentMatch - 1 + searchMatches.length) % searchMatches.length;
      updateSearchNav();
    });
    searchNext.addEventListener('click', () => {
      if (!searchMatches.length) return;
      currentMatch = (currentMatch + 1) % searchMatches.length;
      updateSearchNav();
    });
    searchInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        if (searchMatches.length) {
          currentMatch = (currentMatch + 1) % searchMatches.length;
          updateSearchNav();
        }
      }
    });
    searchInput.addEventListener('blur', () => {
      if (!searchInput.value.trim()) clearHighlights();
    });
    // --- END DM SEARCH LOGIC ---
    // --- LIVE DM UPDATES: CLEANUP, SUBSCRIBE, POLL ---
    if (dmRealtimeSubscription) {
      supabase.removeChannel(dmRealtimeSubscription);
      dmRealtimeSubscription = null;
    }
    if (dmPollingInterval) {
      clearInterval(dmPollingInterval);
      dmPollingInterval = null;
    }
    dmRealtimeSubscription = supabase.channel('realtime:direct_messages_' + friend.id)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'direct_messages'
      }, payload => {
        const msg = payload.new || payload.old;
        if (
          (msg.sender_id === currentUser.id && msg.receiver_id === friend.id) ||
          (msg.sender_id === friend.id && msg.receiver_id === currentUser.id)
        ) {
          loadDMMessages(friend.id);
        }
        updateDMUnreadBadge();
      })
      .subscribe();
  }

  // Load DM messages (final fix for .or() filter)
  async function loadDMMessages(friendId) {
    const messagesArea = document.getElementById('dm-messages');
    if (!messagesArea) return;
    const searchBar = document.getElementById('dm-chat-search-bar');
    const isSearchActive = searchBar && searchBar.classList.contains('active');
    // --- FIX: Do NOT clear messagesArea or renderedDMMessageIds when search is active ---
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
          <img class=\"friend-avatar\" src=\"${user.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.username)}`}\" alt=\"Avatar\">\n
          <div class=\"dm-message-content\">\n
            <div class=\"dm-message-text main-chat-message-text\">${msg.content}</div>\n
          </div>\n
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
            document.execCommand('copy'); // Use this for clipboard access in iframes
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
      const oldHeader = document.getElementById('main-hero-header');
      if (oldHeader) oldHeader.remove();

      // Add the header as a separate element
      const headerDiv = document.createElement('header');
      headerDiv.id = 'main-hero-header';
      headerDiv.className = 'main-hero-header';
      headerDiv.innerHTML = `
        <div class="main-hero-logo-group">
          <span class="main-hero-logo">M</span>
          <span class="main-hero-brand">MONO</span>
        </div>
        <nav class="main-hero-nav">
          <a href="#" class="main-hero-link">Features</a>
          <a href="#" class="main-hero-link">Pricing</a>
          <a href="#" class="main-hero-link">Community</a>
          <a href="#" class="main-hero-link">Support</a>
        </nav>
        <div class="main-hero-header-actions">
          <button class="main-hero-header-btn main-hero-header-btn-outline">Login</button>
          <button class="main-hero-header-btn main-hero-header-btn-gradient">Sign Up</button>
        </div>
      `;
      mainPanel.appendChild(headerDiv);

      // Add the hero section as a separate element
      const heroDiv = document.createElement('div');
      heroDiv.id = 'main-welcome-message';
      heroDiv.className = 'main-hero-section';
      heroDiv.innerHTML = `
        <div class="hero-bubble hero-bubble1"></div>
        <div class="hero-bubble hero-bubble2"></div>
        <div class="hero-bubble hero-bubble3"></div>
        <div class="main-hero-heading">Where Communities<br>Thrive</div>
        <div class="main-hero-subheading">MONO brings people together with seamless voice, video, and text communication. Build your community, your way.</div>
        <div class="main-hero-actions">
          <button class="main-hero-btn main-hero-btn-gradient">GET STARTED</button>
          <button class="main-hero-btn main-hero-btn-outline">Open in Browser</button>
        </div>
      `;
      mainPanel.appendChild(heroDiv);
      // Animate header and hero section elements on load
      setTimeout(() => {
        mainPanel.classList.add('hero-animate-header');
        heroDiv.classList.add('hero-animate');
      }, 80);
    }
  }
  showDefaultWelcome();

  function hideDefaultWelcome() {
    const oldWelcome = document.getElementById('main-welcome-message');
    if (oldWelcome) oldWelcome.remove();
  }

  // --- Voice Channel WebSocket Logic ---
  let voiceWebSocket = null;
  let voiceMembers = [];
  let hasJoined = false;
  // New: Track users in all voice channels
  let voiceChannelUsers = {}; // { channelId: [userObj, ...] }

  const WEBSOCKET_URL = 'wss://mono-luor.onrender.com';

  // Call this when a user joins a voice channel
  async function joinVoiceChannel(selectedChannel, currentUser) {
    if (hasJoined) return;
    hasJoined = true;
    if (voiceWebSocket) {
      voiceWebSocket.close();
      voiceWebSocket = null;
    }
    voiceWebSocket = new WebSocket(WEBSOCKET_URL);
    voiceWebSocket.onopen = () => {
      voiceWebSocket.send(JSON.stringify({
        type: 'join',
        userId: currentUser.id,
        room: selectedChannel.id
      }));
    };
    voiceWebSocket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'user_list_update') {
        // Update mapping for all rooms
        if (data.room && Array.isArray(data.users)) {
          voiceChannelUsers[data.room] = data.users.map(uid => channelUserCache[uid] || { username: 'Unknown', avatar_url: '' });
        }
        // If this is the current channel, update main panel
        if (data.room === selectedChannel.id) {
          voiceMembers = data.users.map(uid => ({
            user_id: uid,
            muted: false,
            users: channelUserCache[uid] || { username: 'Unknown', avatar_url: '' }
          }));
          renderVoiceMembers();
        }
      }
    };
    voiceWebSocket.onerror = (event) => {
      console.error('[Voice WebSocket] Error:', event);
    };
    voiceWebSocket.onclose = (event) => {
      voiceWebSocket = null;
    };
  }

  // Call this when a user leaves a voice channel
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
    // Remove user from the mini user list for this channel
    if (voiceChannelUsers[selectedChannel.id]) {
      voiceChannelUsers[selectedChannel.id] = voiceChannelUsers[selectedChannel.id].filter(u => u.id !== currentUser.id);
    }
    // Optionally clear UI
    voiceMembers = [];
    renderVoiceMembers();
  }

  // Example renderVoiceMembers function (customize as needed)
  function renderVoiceMembers() {
    const mainPanel = document.querySelector('.main-panel');
    if (!mainPanel) return;
    const grid = mainPanel.querySelector('.voice-users-grid');
    if (!grid) return;
    grid.innerHTML = voiceMembers.map((m, idx) => {
      const u = m.users || {};
      const avatar = u.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.username || 'User')}`;
      const colorClass = `color-${(idx % 8) + 1}`;
      return `
          <div class="voice-user-tile ${colorClass}">
            <img class="voice-user-avatar" src="${avatar}" alt="Avatar">
      </div>
    `;
    }).join('');
  }
  // --- End Voice Channel WebSocket Logic ---

  // Simple client-side mute toggle (not communicating with server yet)
  function toggleMute() {
      const currentUser = getUserSession();
      if (!currentUser) return;

      const userIndex = voiceMembers.findIndex(m => m.user_id === currentUser.id);
      if (userIndex !== -1) {
          voiceMembers[userIndex].muted = !voiceMembers[userIndex].muted;
          renderVoiceMembers(); // Re-render to show mute status
          const muteBtn = document.getElementById('voice-mute-btn');
          if (muteBtn) {
              muteBtn.innerHTML = `<i class="fa ${voiceMembers[userIndex].muted ? 'fa-microphone-slash' : 'fa-microphone'}"></i>`;
          }
          console.log(`User ${currentUser.displayname} muted status: ${voiceMembers[userIndex].muted}`);
      }
  }

  // Add event listener for window unload to leave voice channel cleanly
  window.addEventListener('beforeunload', async () => {
    const currentUser = getUserSession();
    if (hasJoined && currentUser && lastSelectedChannel && lastSelectedChannel.type === 'voice') {
      await leaveVoiceChannel(lastSelectedChannel, currentUser);
    }
  });

  // 3-dots menu popover logic
  let friendMenuPopover = null;
  function showFriendMenu(friend, anchorEl, cardEl) {
    closeFriendMenu();
    friendMenuPopover = document.createElement('div');
    friendMenuPopover.className = 'friend-menu-popover';
    friendMenuPopover.innerHTML = `
      <button class="friend-menu-option friend-menu-unfriend">Unfriend</button>
      <button class="friend-menu-option friend-menu-since">Friends Since</button>
      <button class="friend-menu-option friend-menu-block">Block</button>
    `;
    document.body.appendChild(friendMenuPopover);
    // Position menu near 3-dots
    const rect = anchorEl.getBoundingClientRect();
    const popoverRect = friendMenuPopover.getBoundingClientRect();
    let top = rect.bottom + window.scrollY + 4;
    let left = rect.left + window.scrollX - popoverRect.width + rect.width;
    left = Math.max(12, Math.min(left, window.innerWidth - popoverRect.width - 12));
    friendMenuPopover.style.top = `${top}px`;
    friendMenuPopover.style.left = `${left}px`;
    setTimeout(() => friendMenuPopover.classList.add('active'), 10);
    setTimeout(() => {
      document.addEventListener('mousedown', handleFriendMenuOutsideClick);
    }, 0);
    // Option handlers
    friendMenuPopover.querySelector('.friend-menu-unfriend').onclick = async () => {
      await unfriendUser(friend.id);
      closeFriendMenu();
      renderFriendsList();
    };
    friendMenuPopover.querySelector('.friend-menu-since').onclick = () => {
      alert('Friends since: (fetch and display date here)');
      closeFriendMenu();
    };
    friendMenuPopover.querySelector('.friend-menu-block').onclick = async () => {
      await blockUser(friend.id);
      closeFriendMenu();
      renderFriendsList();
    };
  }
  function closeFriendMenu() {
    if (friendMenuPopover) {
      friendMenuPopover.classList.remove('active');
      setTimeout(() => {
        if (friendMenuPopover && friendMenuPopover.parentNode) friendMenuPopover.parentNode.removeChild(friendMenuPopover);
        friendMenuPopover = null;
      }, 120);
      document.removeEventListener('mousedown', handleFriendMenuOutsideClick);
    }
  }
  function handleFriendMenuOutsideClick(e) {
    if (friendMenuPopover && !friendMenuPopover.contains(e.target)) {
      closeFriendMenu();
    }
  }
  // Unfriend function
  async function unfriendUser(friendId) {
    const currentUser = getUserSession();
    await supabase.from('friends')
      .delete()
      .or(`and(user_id.eq.${currentUser.id},friend_id.eq.${friendId}),and(user_id.eq.${friendId},friend_id.eq.${currentUser.id})`);
  }
  // Block function
  async function blockUser(friendId) {
    const currentUser = getUserSession();
    await supabase.from('friends')
      .update({ status: 'blocked' })
      .or(`and(user_id.eq.${currentUser.id},friend_id.eq.${friendId}),and(user_id.eq.${friendId},friend_id.eq.${currentUser.id})`);
  }

  // --- DM CHAT LOGIC ---
  function renderFriendsList() {
    friendsListPanel.innerHTML = '<div class="friends-list-title">Friends</div>';
    supabase
      .from('friends')
      .select('id, user_id, friend_id, status, user:user_id(username, avatar_url, friend_code, banner_url), friend:friend_id(username, avatar_url, friend_code, banner_url)')
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
            banner_url: friendUser?.banner_url || '',
            status: 'Online',
          };
        });
        friends.forEach(friend => {
          const card = document.createElement('div');
          card.className = 'friend-card';
          card.innerHTML = `
            <img class="friend-avatar friend-avatar-clickable" src="${friend.avatar_url}" alt="Avatar" style="cursor:pointer;">
            <span class="friend-username friend-username-clickable" style="cursor:pointer;">${friend.username}</span>
            <button class="friend-menu-btn" title="More options"><i class="fa fa-ellipsis-v"></i></button>
          `;
          // Avatar click: show popover
          card.querySelector('.friend-avatar-clickable').addEventListener('click', (e) => {
            e.stopPropagation();
            showFriendPopover(friend, e.target);
          });
          // Name click: open DM chat
          card.querySelector('.friend-username-clickable').addEventListener('click', () => openDMChat(friend));
          // 3-dots menu logic
          card.querySelector('.friend-menu-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            showFriendMenu(friend, e.target, card);
          });
          friendsListPanel.appendChild(card);
        });
      });
  }

  if (profileLogoutBtn) {
    profileLogoutBtn.addEventListener('click', () => {
      clearUserSession();
      window.location.reload();
    });
  }

  // Robust emoji button event delegation for all chat inputs
  // This works for any #emoji-button, even after dynamic renders

  document.addEventListener('click', function(e) {
    const emojiBtn = e.target.closest('#emoji-button');
    if (emojiBtn) {
      // Find the nearest input in the same row
      const inputRow = emojiBtn.closest('.main-chat-input-row');
      const chatInput = inputRow ? inputRow.querySelector('input.main-chat-input') : null;
      if (chatInput) {
        e.preventDefault();
        showEmojiPicker(chatInput, emojiBtn);
      }
    }
  });

  // Insert profile separator after the user/profile button
  const userBtn = serversSidebar.querySelector('.user-btn');
  if (userBtn) {
    const profileSep = document.createElement('div');
    profileSep.className = 'profile-separator';
    userBtn.insertAdjacentElement('afterend', profileSep);
  }
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
