import { it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import CatalogView from '@/views/CatalogView.vue'
import { apiClient } from '@/api/client'
vi.mock('@/api/client',()=>({apiClient:{listGenres:vi.fn().mockResolvedValue([]),listMovies:vi.fn().mockResolvedValue({items:[],total:100,page:3,page_size:20}),searchMovies:vi.fn()}}))
it('initial deep link loads the same page and filters, then resets removed page to one', async()=>{
 const router=createRouter({history:createMemoryHistory(),routes:[{path:'/movies',component:CatalogView}]})
 await router.push('/movies?page=3&genre=drama&year=2020&sort=rating');await router.isReady()
 const w=mount(CatalogView,{global:{plugins:[router]}});await flushPromises()
 expect(apiClient.listMovies).toHaveBeenLastCalledWith(expect.objectContaining({page:3,genre:'drama',year:2020,sort:'rating'}),expect.any(AbortSignal));expect(w.attributes('data-catalog-ready')).toBe('true')
 await router.replace('/movies?genre=drama');await flushPromises()
 expect(apiClient.listMovies).toHaveBeenLastCalledWith(expect.objectContaining({page:1,genre:'drama'}),expect.any(AbortSignal));w.unmount()
})
