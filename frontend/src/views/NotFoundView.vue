<template>
  <div class="not-found-page">
    <div class="not-found-card">
      <h1 class="error-code">404</h1>
      <h2 class="error-title">Page Not Found</h2>
      <p class="error-message">The page you are looking for does not exist or has been moved.</p>
      <router-link to="/" class="home-btn">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="m12 19-7-7 7-7"/>
          <path d="M19 12H5"/>
        </svg>
        Back to Catalog
      </router-link>
    </div>
  </div>
</template>

<style scoped>
.not-found-page {
  min-height: 80vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.not-found-card {
  text-align: center;
  background: var(--ui-raised);
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-panel);
  padding: 48px 32px;
  max-width: 440px;
  width: 100%;
}

.error-code {
  font-size: 5rem;
  font-weight: 900;
  color: var(--ui-link);
  margin: 0;
  line-height: 1;
  letter-spacing: -2px;
}

.error-title {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--ui-text);
  margin: 16px 0 8px 0;
}

.error-message {
  font-size: 0.95rem;
  color: var(--ui-secondary);
  margin: 0 0 28px 0;
}

.home-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: var(--ui-primary);
  color: var(--ui-on-primary);
  padding: 10px 24px;
  border-radius: var(--ui-radius);
  text-decoration: none;
  font-weight: 600;
  font-size: 0.95rem;
  transition: background 0.15s ease;
}

.home-btn:hover {
  background: var(--ui-primary);
  color: var(--ui-on-primary);
}
</style>
