<script setup lang="ts">
import { ref, onMounted } from 'vue'
import axios from 'axios'
import { useRouter } from 'vue-router'

const router = useRouter()
const stats = ref<any>(null)
const health = ref<any>(null)
const loading = ref(true)
const error = ref('')

const fetchDashboardData = async () => {
  const token = localStorage.getItem('admin_token')
  if (!token) {
    router.push('/login')
    return
  }

  try {
    const config = { headers: { Authorization: `Bearer ${token}` } }
    
    const [statsRes, healthRes] = await Promise.all([
      axios.get('/api/v1/admin/dashboard', config),
      axios.get('/api/v1/admin/health', config)
    ])
    
    stats.value = statsRes.data
    health.value = healthRes.data
  } catch (err: any) {
    if (err.response?.status === 401 || err.response?.status === 403) {
      localStorage.removeItem('admin_token')
      router.push('/login')
    } else {
      error.value = 'Failed to load dashboard data.'
    }
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  fetchDashboardData()
})
</script>

<template>
  <div class="dashboard-page">
    <header class="page-header">
      <h1>Dashboard Overview</h1>
    </header>

    <div v-if="loading" class="loading-state">
      <p>Loading statistics...</p>
    </div>
    
    <div v-else-if="error" class="error-state">
      <p>{{ error }}</p>
      <button @click="fetchDashboardData" class="retry-btn">Retry</button>
    </div>

    <div v-else class="dashboard-content">
      <section class="stats-section">
        <h2 class="section-title">Catalog Statistics</h2>
        <div class="stats-grid">
          <div class="stat-card">
            <span class="stat-label">Total Movies</span>
            <span class="stat-value">{{ stats.movies_total }}</span>
          </div>
          <div class="stat-card">
            <span class="stat-label">Available</span>
            <span class="stat-value text-green">{{ stats.movies_available }}</span>
          </div>
          <div class="stat-card">
            <span class="stat-label">Blocked</span>
            <span class="stat-value text-red">{{ stats.movies_blocked }}</span>
          </div>
          <div class="stat-card">
            <span class="stat-label">Without Poster</span>
            <span class="stat-value text-yellow">{{ stats.movies_without_poster }}</span>
          </div>
          <div class="stat-card">
            <span class="stat-label">Active Sources (TG)</span>
            <span class="stat-value text-blue">{{ stats.telegram_sources_active }}</span>
          </div>
        </div>
      </section>

      <section class="health-section">
        <h2 class="section-title">System Health</h2>
        <div class="health-grid">
          <div class="health-card" v-for="(status, service) in health" :key="service">
            <span class="service-name">{{ service }}</span>
            <span class="service-status" :class="{'status-unknown': status === 'Not checked'}">{{ status }}</span>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.page-header {
  margin-bottom: 32px;
}

.page-header h1 {
  margin: 0;
  font-size: 1.8rem;
  color: #f8fafc;
}

.section-title {
  font-size: 1.2rem;
  color: #94a3b8;
  margin-bottom: 16px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 20px;
  margin-bottom: 40px;
}

.stat-card {
  background: #1e293b;
  border-radius: 12px;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  border: 1px solid #334155;
  transition: transform 0.2s, box-shadow 0.2s;
}

.stat-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.3);
  border-color: #475569;
}

.stat-label {
  font-size: 0.9rem;
  color: #94a3b8;
  font-weight: 500;
}

.stat-value {
  font-size: 2rem;
  font-weight: 700;
  color: #f8fafc;
}

.text-green { color: #4ade80; }
.text-red { color: #ef4444; }
.text-yellow { color: #facc15; }
.text-blue { color: #38bdf8; }

.health-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
}

.health-card {
  background: #1e293b;
  border-radius: 8px;
  padding: 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border: 1px solid #334155;
}

.service-name {
  text-transform: capitalize;
  font-weight: 600;
  color: #cbd5e1;
}

.service-status {
  font-size: 0.85rem;
  padding: 4px 10px;
  border-radius: 12px;
  background: #334155;
  color: #f1f5f9;
}

.status-unknown {
  background: rgba(24acc15, 0.2);
  color: #facc15;
}

.loading-state, .error-state {
  text-align: center;
  padding: 60px;
  color: #94a3b8;
}

.retry-btn {
  margin-top: 16px;
  padding: 8px 16px;
  background: #38bdf8;
  border: none;
  border-radius: 6px;
  color: #0f172a;
  font-weight: bold;
  cursor: pointer;
}
</style>
