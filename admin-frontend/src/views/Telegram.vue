<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import axios from 'axios'
import { useRouter } from 'vue-router'
import { addToast } from '../toast'
import { filterChannels, type ChannelFilter } from '../channelFilters'

const router = useRouter()
const channels = ref<any[]>([])
const loading = ref(true)
const channelStatusFilter = ref<ChannelFilter>('ACTIVE')
const filteredChannels = computed(() => filterChannels(channels.value, channelStatusFilter.value))
const channelFilters: {value: ChannelFilter, label: string}[] = [
  {value: 'ACTIVE', label: 'Активные'}, {value: 'INACTIVE', label: 'Неактивные'}, {value: 'ALL', label: 'Все'}
]
const channelFilterCount = (filter: ChannelFilter) => filterChannels(channels.value, filter).length

// Add channel modal
const showAddModal = ref(false)
const confirmDeleteId = ref<string | null>(null)
const editingChannel = ref<any | null>(null)
const editingIsSeries = ref(false)

// Per-channel states
const syncing = ref<string | null>(null)
const toggling = ref<string | null>(null)
const testing = ref<string | null>(null)
const testResults = ref<Record<string, any>>({})

// Menu state
const openMenuId = ref<string | null>(null)
const toggleMenu = (id: string) => { openMenuId.value = openMenuId.value === id ? null : id }

const auth = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('admin_token')}` } })

const fetchChannels = async () => {
  loading.value = true
  try {
    const res = await axios.get('/api/v1/admin/telegram/channels', auth())
    channels.value = res.data
  } catch (err: any) {
    if (err.response?.status === 401 || err.response?.status === 403) {
      localStorage.removeItem('admin_token')
      router.push('/login')
    } else {
      addToast('Failed to load channels', 'error')
    }
  } finally {
    loading.value = false
  }
}

const restoringNames = ref(false)
const missingNames = computed(() => channels.value.filter(c => c.name_known === false).length)
const restoreNames = async () => {
  restoringNames.value = true
  try {
    const { data } = await axios.post('/api/v1/admin/telegram/channels/restore-names', {}, auth())
    addToast(`Названия восстановлены: ${data.restored}. Без сохранённого названия: ${data.missing}. Каналы не включались.`, data.missing ? 'info' : 'success')
    await fetchChannels()
  } catch (err: any) {
    addToast(err.response?.data?.detail || 'Не удалось восстановить названия', 'error')
  } finally { restoringNames.value = false }
}

// Entity Discovery state
const entities = ref<any[]>([])
const loadingEntities = ref(false)
const entitiesError = ref('')
const searchEntity = ref('')
const typeFilter = ref('All') // All, Channels, Groups
const statusFilter = ref('All') // All, Connected, Not connected
const addMode = ref('search') // search, manual
const newChannelId = ref('')
const newChannelIsSeries = ref(false)
const adding = ref<string | null>(null) // Stores telegram_id being added

const fetchEntities = async () => {
  loadingEntities.value = true
  entitiesError.value = ''
  try {
    const res = await axios.get('/api/v1/admin/telegram/entities', auth())
    entities.value = res.data
  } catch (err: any) {
    if (err.response?.status === 401 || err.response?.status === 403) {
      localStorage.removeItem('admin_token')
      router.push('/login')
    } else {
      entitiesError.value = 'Unable to load Telegram channels.'
      addToast('Failed to load Telegram channels', 'error')
    }
  } finally {
    loadingEntities.value = false
  }
}

watch(showAddModal, (val) => {
  if (val && entities.value.length === 0) {
    fetchEntities()
  }
  if (!val) {
    searchEntity.value = ''
    newChannelId.value = ''
    newChannelIsSeries.value = false
    addMode.value = 'search'
  }
})

const normalizeId = (id: string | null | undefined) => {
  if (!id) return ''
  let s = String(id).trim().toLowerCase()
  if (s.startsWith('@')) s = s.slice(1)
  if (s.startsWith('-100')) s = s.slice(4)
  if (s.startsWith('-')) s = s.slice(1)
  return s
}

const isChannelConnected = (tid: string, username?: string) => {
  const normTid = normalizeId(tid)
  const normUsername = normalizeId(username)
  return channels.value.some(c => {
    if (c.status !== 'ACTIVE') return false
    const normCid = normalizeId(c.channel_id)
    const normCName = normalizeId(c.name)
    if (normTid && normCid === normTid) return true
    if (normUsername && (normCid === normUsername || normCName === normUsername)) return true
    return false
  })
}

const filteredEntities = computed(() => {
  let list = entities.value
  
  if (typeFilter.value === 'Channels') list = list.filter(e => e.entity_type === 'CHANNEL')
  if (typeFilter.value === 'Groups') list = list.filter(e => e.entity_type === 'GROUP')
  if (statusFilter.value === 'Connected') list = list.filter(e => isChannelConnected(e.telegram_id, e.username))
  if (statusFilter.value === 'Not connected') list = list.filter(e => !isChannelConnected(e.telegram_id, e.username))
  
  const q = searchEntity.value.toLowerCase().trim()
  if (q) {
    list = list.filter(e => 
      e.title.toLowerCase().includes(q) || 
      (e.username && e.username.toLowerCase().includes(q)) ||
      e.telegram_id.includes(q)
    )
  }
  return list
})

const addChannel = async (cid: string) => {
  if (!cid) return addToast('Channel ID is required', 'error')
  adding.value = cid
  try {
    await axios.post('/api/v1/admin/telegram/channels', { 
      channel_id: cid,
      is_series_channel: newChannelIsSeries.value
    }, auth())
    await fetchChannels()
    if (addMode.value === 'manual') {
      newChannelId.value = ''
      newChannelIsSeries.value = false
    }
    showAddModal.value = false
    addToast(`Channel connected`, 'success')
  } catch (err: any) {
    addToast(err.response?.data?.detail || 'Failed to add channel', 'error')
  } finally {
    adding.value = null
  }
}

const toggleChannelStatus = async (channel: any) => {
  toggling.value = channel.channel_id
  const newStatus = channel.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE'
  try {
    await axios.put(`/api/v1/admin/telegram/channels/${encodeURIComponent(channel.channel_id)}`, { status: newStatus }, auth())
    await fetchChannels()
    addToast(`Channel ${newStatus === 'ACTIVE' ? 'enabled' : 'disabled'}`, 'success')
  } catch (err: any) {
    addToast(err.response?.data?.detail || 'Failed to update channel', 'error')
  } finally {
    toggling.value = null
  }
}

const openEditModal = (channel: any) => {
  editingChannel.value = channel
  editingIsSeries.value = channel.is_series_channel
}

const updateChannelSettings = async () => {
  if (!editingChannel.value) return
  const cid = editingChannel.value.channel_id
  try {
    await axios.put(`/api/v1/admin/telegram/channels/${encodeURIComponent(cid)}`, { is_series_channel: editingIsSeries.value }, auth())
    await fetchChannels()
    addToast(`Channel settings updated`, 'success')
    editingChannel.value = null
  } catch (err: any) {
    addToast(err.response?.data?.detail || 'Failed to update settings', 'error')
  }
}

async function waitBackground(data:any){
  if(!data.job_id)return data
  for(let n=0;n<240;n++){
    await new Promise(r=>setTimeout(r,750))
    const response=await axios.get('/api/v1/admin/background/jobs/'+data.job_id,auth())
    if(response.data.status==='ok')return {status:'ok',...response.data.result}
    if(response.data.status==='error')throw new Error(response.data.message||'Remote operation failed')
  }
  throw new Error('Operation timed out')
}

const syncChannel = async (channel: any) => {
  syncing.value = channel.channel_id
  try {
    const queued=await axios.post(`/api/v1/admin/telegram/channels/${encodeURIComponent(channel.channel_id)}/sync`, {}, auth())
    await waitBackground(queued.data)
    await fetchChannels()
    addToast(`Sync completed for ${channel.channel_id}`, 'success')
  } catch (err: any) {
    addToast(err.response?.data?.detail || 'Failed to start sync', 'error')
  } finally {
    syncing.value = null
  }
}

const testConnection = async (channel: any) => {
  testing.value = channel.channel_id
  testResults.value = { ...testResults.value, [channel.channel_id]: null }
  try {
    const res = await axios.post(`/api/v1/admin/telegram/channels/${encodeURIComponent(channel.channel_id)}/test`, {}, auth())
    const result=await waitBackground(res.data)
    testResults.value = { ...testResults.value, [channel.channel_id]: result }
    if (result.status === 'ok') addToast(`Connection OK`, 'success')
    else addToast(`Connection failed: ${result.message}`, 'error')
  } catch (err: any) {
    addToast(err.response?.data?.detail || 'Test failed', 'error')
    testResults.value = { ...testResults.value, [channel.channel_id]: { status: 'error', message: 'Request failed' } }
  } finally {
    testing.value = null
  }
}

const deleteChannel = async (channelId: string) => {
  try {
    await axios.delete(`/api/v1/admin/telegram/channels/${encodeURIComponent(channelId)}`, auth())
    await fetchChannels()
    confirmDeleteId.value = null
    addToast(`Channel "${channelId}" removed`, 'success')
  } catch (err: any) {
    addToast(err.response?.data?.detail || 'Failed to delete channel', 'error')
  }
}

const formatDate = (d: string | null) => d ? new Date(d).toLocaleString() : 'Never'

onMounted(() => {
  fetchChannels()
  document.addEventListener('click', () => { openMenuId.value = null })
})
</script>

<template>
  <div class="telegram-page">
    <div class="page-header">
      <div>
        <h1>Telegram Sources</h1>
        <p class="page-subtitle">{{ channels.length }} channel{{ channels.length !== 1 ? 's' : '' }} configured</p>
      </div>
      <button class="btn-add" @click="showAddModal = true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        Add Channel
      </button>
    </div>

    <div class="channel-filters" role="group" aria-label="Фильтр Telegram-каналов">
      <button v-for="filter in channelFilters" :key="filter.value" type="button"
        :aria-pressed="channelStatusFilter === filter.value"
        @click="channelStatusFilter = filter.value">{{ filter.label }} ({{ channelFilterCount(filter.value) }})</button>
    </div>
    <div v-if="missingNames" class="empty-state" style="padding: 16px; margin-bottom: 16px;">
      <p>У {{ missingNames }} каналов не сохранено название. Можно восстановить последнее известное название из локального кэша Telegram — без подключения и включения каналов.</p>
      <button class="btn-add" :disabled="restoringNames" @click="restoreNames">{{ restoringNames ? 'Восстановление…' : 'Восстановить названия' }}</button>
    </div>
    <div v-if="loading" class="loading-state">
      <div class="loading-spinner"></div>
      <span>Loading channels...</span>
    </div>

    <div v-else-if="channels.length === 0" class="empty-state">
      <svg viewBox="0 0 24 24" fill="currentColor" width="48" height="48" style="color: #334155">
        <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.248l-2.04 9.613c-.153.682-.555.849-1.124.528l-3.104-2.286-1.497 1.44c-.166.166-.305.305-.625.305l.222-3.16 5.77-5.21c.25-.222-.055-.345-.388-.123L6.237 14.12l-3.054-.952c-.664-.208-.677-.664.138-.984l11.93-4.601c.554-.199 1.038.136.311.665z"/>
      </svg>
      <h3>No channels configured</h3>
      <p>Add a Telegram channel to start ingesting movies.</p>
      <button class="btn-add" @click="showAddModal = true">Add Channel</button>
    </div>

    <div v-else-if="filteredChannels.length === 0" class="empty-state">
      <h3>Нет каналов в выбранной категории</h3>
      <p>Другие каналы сохранены. Выберите «Все», чтобы их посмотреть.</p>
      <button class="btn-add" @click="channelStatusFilter = 'ALL'">Показать все</button>
    </div>
    <div v-else class="channels-grid">
      <div
        v-for="channel in filteredChannels"
        :key="channel.channel_id"
        class="channel-card"
        :class="{ 'card-disabled': channel.status !== 'ACTIVE' }"
      >
        <div class="card-top">
          <div class="channel-identity">
            <div class="channel-icon" :class="{ 'icon-disabled': channel.status !== 'ACTIVE' }">
              <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.248l-2.04 9.613c-.153.682-.555.849-1.124.528l-3.104-2.286-1.497 1.44c-.166.166-.305.305-.625.305l.222-3.16 5.77-5.21c.25-.222-.055-.345-.388-.123L6.237 14.12l-3.054-.952c-.664-.208-.677-.664.138-.984l11.93-4.601c.554-.199 1.038.136.311.665z"/>
              </svg>
            </div>
            <div>
              <div class="channel-name" style="display: flex; align-items: center; gap: 8px;">
                {{ channel.name || 'Название не сохранено' }}
                <span class="type-badge" :class="channel.is_series_channel ? 'type-series' : 'type-movie'">
                  {{ channel.is_series_channel ? 'SERIES' : 'MOVIE' }}
                </span>
              </div>
              <div class="channel-id">
                <template v-if="channel.username">
                  @{{ channel.username }} <span style="opacity: 0.65; margin-left: 6px; font-weight: normal;">(ID: {{ channel.channel_id }})</span>
                </template>
                <template v-else>
                  ID: {{ channel.channel_id }}
                </template>
              </div>
            </div>
          </div>
          <span class="status-badge" :class="channel.status === 'ACTIVE' ? 'badge-active' : 'badge-disabled'">
            {{ channel.status }}
          </span>
        </div>

        <div class="channel-stats">
          <div v-if="!channel.is_series_channel || channel.current_movies > 0" class="stat-item stat-highlight">
            <span class="stat-label">Фильмы</span>
            <span class="stat-val stat-val-primary">{{ channel.current_movies?.toLocaleString() ?? '—' }}</span>
          </div>
          <div v-if="channel.is_series_channel || channel.current_series > 0" class="stat-item stat-highlight">
            <span class="stat-label">Сериалы</span>
            <span class="stat-val stat-val-primary">{{ channel.current_series?.toLocaleString() ?? '—' }}</span>
          </div>
          <div v-if="channel.is_series_channel || channel.current_series > 0" class="stat-item">
            <span class="stat-label">Эпизоды</span>
            <span class="stat-val">{{ channel.current_episodes?.toLocaleString() ?? '—' }}</span>
          </div>
          <div class="stat-item" title="Уникальные Telegram-сообщения с активными файлами; это не число фильмов или сериалов.">
            <span class="stat-label">Файлы активных источников</span>
            <span class="stat-val">{{ channel.active_physical_resources?.toLocaleString() ?? '—' }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Messages Processed</span>
            <span class="stat-val">{{ channel.messages_processed?.toLocaleString() || '0' }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Last Message ID</span>
            <span class="stat-val">{{ channel.last_seen_message_id || '—' }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Last Sync</span>
            <span class="stat-val">{{ formatDate(channel.last_synced_at) }}</span>
          </div>
          <div v-if="channel.last_error" class="stat-item error-row">
            <span class="stat-label">Last Error</span>
            <span class="stat-val error-text">{{ channel.last_error }}</span>
          </div>
        </div>

        <div v-if="testResults[channel.channel_id]" class="test-result"
          :class="testResults[channel.channel_id].status === 'ok' ? 'test-ok' : 'test-fail'"
        >
          {{ testResults[channel.channel_id].status === 'ok'
            ? `Connected as: ${testResults[channel.channel_id].name}`
            : testResults[channel.channel_id].message }}
        </div>

        <div class="card-actions-polished">
          <button
            class="primary-act-btn act-sync"
            @click="syncChannel(channel)"
            :disabled="syncing === channel.channel_id || channel.status !== 'ACTIVE'"
          >
            {{ syncing === channel.channel_id ? 'Syncing...' : 'Sync Now' }}
          </button>
          <button
            class="secondary-act-btn"
            @click="toggleChannelStatus(channel)"
            :disabled="toggling === channel.channel_id"
          >
            {{ toggling === channel.channel_id ? '...' : (channel.status === 'ACTIVE' ? 'Disable' : 'Enable') }}
          </button>
          
          <div class="channel-actions-menu" @click.stop>
            <button class="menu-trigger-btn" @click="toggleMenu(channel.channel_id)">⋮</button>
            <div v-if="openMenuId === channel.channel_id" class="menu-dropdown">
              <button class="menu-item" @click="testConnection(channel); openMenuId = null">
                {{ testing === channel.channel_id ? 'Testing...' : 'Test Connection' }}
              </button>
              <button class="menu-item" @click="openEditModal(channel); openMenuId = null">
                Edit Settings
              </button>
              <div class="menu-divider"></div>
              <button class="menu-item text-danger" @click="confirmDeleteId = channel.channel_id; openMenuId = null">
                Remove
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Add modal -->
    <div v-if="showAddModal" class="modal-overlay" @click.self="showAddModal = false">
      <div class="modal modal-large">
        <div class="modal-header">
          <h3>Add Telegram Source</h3>
          <button class="modal-close" @click="showAddModal = false">&times;</button>
        </div>

        <div style="padding: 16px 20px; border-bottom: 1px solid rgba(255,255,255,0.06); display: flex; align-items: center;">
          <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; color: #cbd5e1; font-weight: 500;">
            <input type="checkbox" v-model="newChannelIsSeries" style="width: 16px; height: 16px;" />
            <span>Series channel</span>
          </label>
        </div>
        
        <div class="modal-tabs">
          <button class="tab-btn" :class="{ active: addMode === 'search' }" @click="addMode = 'search'">My Telegram Channels</button>
          <button class="tab-btn" :class="{ active: addMode === 'manual' }" @click="addMode = 'manual'">Add Manually</button>
        </div>

        <!-- Entity Search Mode -->
        <div v-if="addMode === 'search'" class="modal-body mode-search">
          <div class="search-box">
            <input v-model="searchEntity" placeholder="Search channels by name or username..." class="search-input" />
          </div>
          <div class="filters-row">
            <div class="filter-group">
              <label>Type:</label>
              <select v-model="typeFilter" class="filter-select">
                <option>All</option>
                <option>Channels</option>
                <option>Groups</option>
              </select>
            </div>
            <div class="filter-group">
              <label>Status:</label>
              <select v-model="statusFilter" class="filter-select">
                <option>All</option>
                <option>Connected</option>
                <option>Not connected</option>
              </select>
            </div>
            <button class="refresh-btn" @click="fetchEntities" :disabled="loadingEntities">Refresh</button>
          </div>

          <div class="entity-list">
            <div v-if="loadingEntities" class="loading-state">Loading Telegram channels...</div>
            <div v-else-if="entitiesError" class="empty-state error">{{ entitiesError }}</div>
            <div v-else-if="filteredEntities.length === 0" class="empty-state">No Telegram channels found.</div>
            <div v-else class="entity-item" v-for="entity in filteredEntities" :key="entity.telegram_id">
              <div class="entity-info">
                <div class="entity-title">{{ entity.title }}</div>
                <div class="entity-meta">
                  <span v-if="entity.username">@{{ entity.username }}</span>
                  <span v-else class="entity-id">{{ entity.telegram_id }}</span>
                </div>
              </div>
              <div class="entity-action">
                <button v-if="!isChannelConnected(entity.telegram_id, entity.username)" class="btn-connect" :disabled="adding === entity.telegram_id" @click="addChannel(entity.telegram_id)">
                  {{ adding === entity.telegram_id ? 'Connecting...' : 'Connect' }}
                </button>
                <div v-else class="connected-badge">Connected</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Manual Mode -->
        <div v-if="addMode === 'manual'" class="modal-body mode-manual">
          <div class="field-group">
            <label>Telegram ID / Username</label>
            <div class="manual-input-row">
              <input v-model="newChannelId" placeholder="e.g. -1001234567890 or @kinosota" class="field-input" @keydown.enter="addChannel(newChannelId.trim())" />
              <button class="btn-resolve" @click="addChannel(newChannelId.trim())" :disabled="adding === newChannelId.trim()">
                {{ adding === newChannelId.trim() ? 'Resolving...' : 'Resolve & Connect' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Delete confirm -->
    <div v-if="confirmDeleteId" class="modal-overlay" @click.self="confirmDeleteId = null">
      <div class="modal-confirm">
        <h3>Remove Channel?</h3>
        <p>This removes <strong>{{ confirmDeleteId }}</strong> from sync. Existing movies are <strong>preserved</strong>.</p>
        <div class="confirm-actions">
          <button class="btn-cancel-confirm" @click="confirmDeleteId = null">Cancel</button>
          <button class="btn-confirm-danger" @click="deleteChannel(confirmDeleteId)">Remove Channel</button>
        </div>
      </div>
    </div>

    <!-- Edit modal -->
    <div v-if="editingChannel" class="modal-overlay" @click.self="editingChannel = null">
      <div class="modal" style="max-width: 400px;">
        <div class="modal-header">
          <h3>Edit Settings: {{ editingChannel.name || editingChannel.channel_id }}</h3>
          <button class="modal-close" @click="editingChannel = null">&times;</button>
        </div>
        
        <div class="modal-body" style="padding: 24px 20px;">
          <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; color: #cbd5e1; font-weight: 500;">
            <input type="checkbox" v-model="editingIsSeries" style="width: 16px; height: 16px;" />
            <span>Series channel</span>
          </label>
          <p style="margin-top: 12px; color: #94a3b8; font-size: 0.85rem; line-height: 1.4;">
            Check this if the channel is dedicated to TV Shows/Series. If unchecked, the channel will be processed as a standard Movie source.
          </p>
        </div>

        <div class="modal-footer" style="padding: 16px 20px; border-top: 1px solid rgba(255,255,255,0.06); display: flex; justify-content: flex-end; gap: 12px;">
          <button class="btn-cancel-confirm" @click="editingChannel = null">Cancel</button>
          <button class="btn-resolve" @click="updateChannelSettings">Save Settings</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.channel-filters { display:flex; flex-wrap:wrap; gap:8px; margin:16px 0 24px; }
.channel-filters button { padding:10px 16px; border:1px solid var(--ui-control); border-radius:var(--ui-radius); background:var(--ui-raised); color:var(--ui-secondary); cursor:pointer; }
.channel-filters button[aria-pressed="true"] { background:var(--ui-primary); color:var(--ui-on-primary); border-color:var(--ui-control); }

.telegram-page { max-width: 1200px; }
.page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 28px; }
.page-header h1 { margin: 0 0 4px; font-size: 1.75rem; font-weight: 800; color: var(--ui-text); }
.page-subtitle { margin: 0; color: var(--ui-link); font-size: 0.875rem; }

.btn-add { display: flex; align-items: center; gap: 6px; padding: 9px 18px; background: var(--ui-primary); border: none; border-radius: var(--ui-radius); color: var(--ui-on-primary); font-size: 0.875rem; font-weight: 700; cursor: pointer; transition: background 0.15s; }
.btn-add:hover { background: var(--ui-primary); color:var(--ui-on-primary); }

.loading-state { display: flex; align-items: center; justify-content: center; padding: 60px; color: var(--ui-link); }
.empty-state { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 60px; background: var(--ui-raised); border: 1px solid var(--ui-border); border-radius: var(--ui-radius); color: var(--ui-link); text-align: center; }

.channels-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 20px; }
.channel-card { background: var(--ui-raised); border: 1px solid var(--ui-border); border-radius: var(--ui-radius); overflow: hidden; transition: border-color 0.15s; }
.card-disabled { opacity: 0.7; }
.card-top { display: flex; justify-content: space-between; align-items: flex-start; padding: 16px 16px 0; }
.channel-identity { display: flex; align-items: center; gap: 12px; }
.channel-icon { width: 40px; height: 40px; border-radius: var(--ui-radius); background: var(--ui-raised); color: var(--ui-link); display: flex; align-items: center; justify-content: center; }
.channel-name { font-weight: 600; color: var(--ui-text); font-size: 0.95rem; }
.channel-id { font-size: 0.8rem; color: var(--ui-link); }
.status-badge { font-size: 12px; font-weight: 700; padding: 3px 8px; border-radius: var(--ui-radius); text-transform: uppercase; }
.badge-active { background: rgba(52, 211, 153, 0.15); color: var(--ui-success); }
.badge-disabled { background: var(--ui-raised); color: var(--ui-link); }

.type-badge { font-size: 12px; font-weight: 800; padding: 2px 6px; border-radius: 4px; letter-spacing: 0.5px; }
.type-movie { background: var(--ui-raised); color: var(--ui-link); }
.type-series { background: var(--ui-raised); color: var(--ui-link); }

.channel-stats { padding: 16px; display: flex; flex-direction: column; gap: 8px; }
.stat-item { display: flex; justify-content: space-between; font-size: 0.85rem; }
.stat-highlight { padding: 8px 10px; margin: -4px -4px 4px; background: var(--ui-raised); border: 1px solid var(--ui-border); border-radius: var(--ui-radius); }
.stat-label { color: var(--ui-link); }
.stat-label-sub { font-size: 12px; color: var(--ui-link); }
.stat-val { color: var(--ui-secondary); font-weight: 500; }
.stat-val-primary { color: var(--ui-link); font-weight: 700; font-size: 1rem; }
.error-text { color: var(--ui-danger); max-width: 200px; text-align: right; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.test-result { margin: 0 16px 12px; padding: 8px 12px; border-radius: var(--ui-radius); font-size: 0.8rem; }
.test-ok { background: rgba(52, 211, 153, 0.1); color: var(--ui-success); }
.test-fail { background: rgba(248, 113, 113, 0.1); color: var(--ui-danger); }

.card-actions-polished { display: flex; gap: 8px; padding: 16px; border-top: 1px solid var(--ui-border); background: rgba(0,0,0,0.1); align-items: center; }
.primary-act-btn, .secondary-act-btn { flex: 1; padding: 8px 12px; border: none; border-radius: var(--ui-radius); font-size: 0.85rem; font-weight: 600; cursor: pointer; transition: all 0.15s; display: flex; align-items: center; justify-content: center; gap: 6px; }
.primary-act-btn { background: var(--ui-primary); color: var(--ui-on-primary); }
.primary-act-btn:hover:not(:disabled) { background: var(--ui-primary); color:var(--ui-on-primary); }
.primary-act-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.secondary-act-btn { background: var(--ui-raised); color: var(--ui-text); }
.secondary-act-btn:hover:not(:disabled) { background: var(--ui-raised); color:var(--ui-text); }
.secondary-act-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.channel-actions-menu { position: relative; }
.menu-trigger-btn { background: transparent; border: none; color: var(--ui-link); font-size: 1.2rem; font-weight: 600; cursor: pointer; padding: 4px 8px; border-radius: var(--ui-radius); display: flex; align-items: center; justify-content: center; }
.menu-trigger-btn:hover { background: var(--ui-raised); color: var(--ui-text); }
.menu-dropdown { position: absolute; bottom: 100%; right: 0; margin-bottom: 8px; background: var(--ui-raised); border: 1px solid var(--ui-control); border-radius: var(--ui-radius); padding: 4px; min-width: 140px; box-shadow: 0 -10px 15px -3px rgba(0,0,0,0.5); z-index: 10; }
.menu-item { width: 100%; text-align: left; padding: 8px 12px; background: transparent; border: none; color: var(--ui-text); font-size: 0.85rem; border-radius: 4px; cursor: pointer; }
.menu-item:hover { background: var(--ui-raised); color:var(--ui-text); }
.menu-divider { height: 1px; background: var(--ui-raised); margin: 4px 0; color:var(--ui-text); }
.text-danger { color: var(--ui-danger) !important; }
.text-danger:hover { color: var(--ui-danger); background: rgba(239, 68, 68, 0.1); }

/* Modal Styles */
.modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: var(--ui-surface); backdrop-filter: none; display: flex; align-items: center; justify-content: center; z-index: 100; }
.modal { background: var(--ui-raised); border: 1px solid var(--ui-border); border-radius: var(--ui-radius); width: 400px; max-width: 90vw; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5); display: flex; flex-direction: column; }
.modal-large { width: 600px; height: 80vh; max-height: 700px; }
.modal-header { padding: 20px; border-bottom: 1px solid var(--ui-border); display: flex; justify-content: space-between; align-items: center; }
.modal-header h3 { margin: 0; font-size: 1.1rem; color: var(--ui-text); }
.modal-close { background: none; border: none; color: var(--ui-link); font-size: 1.5rem; cursor: pointer; padding: 0; line-height: 1; }
.modal-close:hover { color: var(--ui-text); }
.modal-tabs { display: flex; border-bottom: 1px solid var(--ui-border); }
.tab-btn { flex: 1; background: none; border: none; padding: 12px; color: var(--ui-link); font-weight: 600; cursor: pointer; border-bottom: 2px solid transparent; }
.tab-btn.active { color: var(--ui-link); border-bottom-color: var(--ui-control); }
.tab-btn:hover:not(.active) { color: var(--ui-secondary); }
.modal-body { padding: 20px; flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 16px; }

.search-input { width: 100%; padding: 10px 14px; background: var(--ui-surface); border: 1px solid var(--ui-control); border-radius: var(--ui-radius); color: white; font-size: 0.95rem; }
.filters-row { display: flex; gap: 12px; align-items: center; }
.filter-group { display: flex; align-items: center; gap: 8px; }
.filter-group label { font-size: 0.85rem; color: var(--ui-link); }
.filter-select { background: var(--ui-surface); border: 1px solid var(--ui-control); color: white; border-radius: var(--ui-radius); padding: 4px 8px; font-size: 0.85rem; }
.refresh-btn { margin-left: auto; background: none; border: 1px solid var(--ui-border); color: var(--ui-secondary); padding: 4px 10px; border-radius: var(--ui-radius); cursor: pointer; font-size: 0.85rem; }
.refresh-btn:hover { background: var(--ui-raised); color: white; }

.entity-list { display: flex; flex-direction: column; gap: 8px; flex: 1; }
.entity-item { display: flex; justify-content: space-between; align-items: center; padding: 12px; background: var(--ui-raised); border: 1px solid var(--ui-border); border-radius: var(--ui-radius); }
.entity-info { display: flex; flex-direction: column; gap: 4px; }
.entity-title { font-weight: 600; color: var(--ui-text); font-size: 0.95rem; }
.entity-meta { display: flex; align-items: center; gap: 8px; font-size: 0.8rem; color: var(--ui-link); }
.btn-connect { background: var(--ui-primary); color: var(--ui-on-primary); border: none; border-radius: var(--ui-radius); padding: 6px 12px; font-size: 0.85rem; font-weight: 600; cursor: pointer; }
.btn-connect:hover:not(:disabled) { background: var(--ui-primary); color:var(--ui-on-primary); }
.btn-connect:disabled { opacity: 0.5; }
.connected-badge { color: var(--ui-success); font-size: 0.85rem; font-weight: 600; }

.field-group { display: flex; flex-direction: column; gap: 8px; padding: 24px; background: var(--ui-raised); border: 1px solid var(--ui-border); border-radius: var(--ui-radius); }
.field-group label { font-size: 0.9rem; font-weight: 600; color: var(--ui-text); }
.manual-input-row { display: flex; gap: 12px; }
.field-input { flex: 1; padding: 10px 14px; background: var(--ui-surface); border: 1px solid var(--ui-control); border-radius: var(--ui-radius); color: white; font-size: 0.95rem; }
.btn-resolve { background: var(--ui-primary); color: var(--ui-on-primary); border: none; border-radius: var(--ui-radius); padding: 0 20px; font-weight: 600; cursor: pointer; }

.modal-confirm { background: var(--ui-raised); border: 1px solid var(--ui-border); border-radius: var(--ui-radius); padding: 24px; width: 100%; box-shadow: 0 20px 40px rgba(0,0,0,0.5); }
.modal-confirm h3 { margin: 0 0 8px; font-size: 1.05rem; }
.modal-confirm p { margin: 0 0 20px; color: var(--ui-link); font-size: 0.875rem; }
.confirm-actions { display: flex; justify-content: flex-end; gap: 10px; }
.btn-cancel-confirm { padding: 8px 16px; background: transparent; border: 1px solid var(--ui-control); color: var(--ui-link); border-radius: var(--ui-radius); cursor: pointer; }
.btn-delete-confirm { padding: 8px 20px; background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.3); color: var(--ui-danger); border-radius: var(--ui-radius); cursor: pointer; font-weight: 700; }
</style>
