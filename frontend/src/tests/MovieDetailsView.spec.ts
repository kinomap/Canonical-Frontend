import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import MovieDetailsView from '@/views/MovieDetailsView.vue'
import { apiClient, ApiError } from '@/api/client'
import { createRouter, createMemoryHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

vi.mock('@/api/client', () => ({
  adRequest: vi.fn().mockResolvedValue({cue_points:[],plan_token:null}),
  apiClient: {
    getMovie: vi.fn(),
    getAudioTracks: vi.fn(),
  getComments: vi.fn(),
  getReactions: vi.fn(),
    listMovies: vi.fn(),
    listGenres: vi.fn(),
    searchMovies: vi.fn(),
    startPlayback: vi.fn(),
    diagnosePlayback: vi.fn(),
    heartbeatPlayback: vi.fn(),
    stopPlayback: vi.fn(),
    getCurrentUser: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    constructor(public status: number, message: string) {
      super(message)
    }
  }
}))

describe('MovieDetailsView.vue', () => {
  let router: any

  beforeEach(async () => {
    vi.resetAllMocks()
    vi.mocked(apiClient.diagnosePlayback).mockResolvedValue({state:'available'})
    vi.spyOn(HTMLMediaElement.prototype,'play').mockResolvedValue(undefined)
    vi.spyOn(HTMLMediaElement.prototype,'pause').mockImplementation(()=>{})

    router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: { template: '<div>Catalog</div>' } },
        { path: '/movies/:id', component: MovieDetailsView }
      ]
    })

    await router.push('/movies/movie-123')
    await router.isReady()
  })

  it('renders movie details correctly when API succeeds', async () => {
    const mockMovie = {
      id: 'movie-123',
      title: 'Sample Movie Title',
      original_title: 'Sample Original Title',
      year: 2026,
      poster: 'http://poster.jpg',
      rating: 8.7,
      runtime: 112,
      quality: 'HD',
      status: 'available',
      genres: [{ id: 1, name: 'Drama', slug: 'drama' }],
      overview: 'This is a sample movie overview.',
      backdrop: 'http://backdrop.jpg',
      tmdb_id: 12345,
      mime_type: 'video/mp4',
      file_size: 2027030264
    }

    vi.mocked(apiClient.getMovie).mockResolvedValueOnce(mockMovie)
    vi.mocked(apiClient.getAudioTracks).mockResolvedValueOnce([])

    const wrapper = mount(MovieDetailsView, {
      global: { plugins: [router] }
    })

    await flushPromises()

    expect(wrapper.text()).toContain('Sample Movie Title')
    expect(wrapper.text()).toContain('2026')
    expect(wrapper.text()).toContain('8.7')
    expect(wrapper.text()).toContain('1h 52m')
    expect(wrapper.text()).toContain('1.89 GB')
    expect(wrapper.text()).toContain('This is a sample movie overview.')
  })

  it('renders audio tracks when present', async () => {
    const mockMovie = {
      id: 'movie-123',
      title: 'Movie with Audio',
      original_title: '',
      year: 2024,
      poster: null,
      rating: null,
      runtime: 90,
      quality: 'HD',
      status: 'available',
      genres: [],
      overview: '',
      backdrop: null,
      tmdb_id: null,
      mime_type: 'video/mp4',
      file_size: 1000000
    }

    const mockTracks = [
      {
        id: 1,
        track_index: 0,
        language: 'ru',
        title: 'Russian AAC',
        codec: 'aac',
        channels: 2,
        sample_rate: 48000,
        is_default: true
      }
    ]

    vi.mocked(apiClient.getMovie).mockResolvedValueOnce(mockMovie)
    vi.mocked(apiClient.getAudioTracks).mockResolvedValueOnce(mockTracks)

    const wrapper = mount(MovieDetailsView, {
      global: { plugins: [router] }
    })

    await flushPromises()

    await wrapper.find('.expand-btn').trigger('click')
    expect(wrapper.text()).toContain('Russian AAC')
    expect(wrapper.text()).toContain('Track #1')
    expect(wrapper.text()).toContain('Default')
  })

  it('hides the audio tracks block when the movie has no audio tracks', async () => {
    const mockMovie = {
      id: 'movie-123',
      title: 'Movie without Audio Tracks',
      original_title: '',
      year: 2024,
      poster: null,
      rating: null,
      runtime: 90,
      quality: 'HD',
      status: 'available',
      genres: [],
      overview: '',
      backdrop: null,
      tmdb_id: null,
      mime_type: 'video/mp4',
      file_size: 1000000
    }

    vi.mocked(apiClient.getMovie).mockResolvedValueOnce(mockMovie)
    vi.mocked(apiClient.getAudioTracks).mockResolvedValueOnce([])

    const wrapper = mount(MovieDetailsView, {
      global: { plugins: [router] }
    })

    await flushPromises()

    await wrapper.find('.expand-btn').trigger('click')
    expect(wrapper.find('.audio-tracks-section').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Audio tracks unavailable')
  })

  it('starts playback when Play button clicked', async () => {
    const mockMovie = {
      id: 'movie-123',
      title: 'Playable Movie',
      original_title: '',
      year: 2024,
      poster: null,
      rating: null,
      runtime: 90,
      quality: 'HD',
      status: 'available',
      genres: [],
      overview: '',
      backdrop: null,
      tmdb_id: null,
      mime_type: 'video/mp4',
      file_size: 1000000
    }

    vi.mocked(apiClient.getMovie).mockResolvedValueOnce(mockMovie)
    vi.mocked(apiClient.getAudioTracks).mockResolvedValueOnce([])
    vi.mocked(apiClient.startPlayback).mockResolvedValueOnce({
      session_id: 's1',
      media_endpoint: '/api/v1/playback/stream/movie-123',
      playback_token: 'token123',
      node_id: 'node1',
      media_url: 'http://10.8.0.2:8090/stream/movie-123?token=token123',
      heartbeat_interval_seconds: 30
    })
    vi.mocked(apiClient.getCurrentUser).mockResolvedValue({ id: 'u1', username: 'viewer' } as any)
    vi.mocked(apiClient.stopPlayback).mockResolvedValue({ ok: true })
    useAuthStore().setToken('test-token')

    const wrapper = mount(MovieDetailsView, {
      global: { plugins: [router] },
      attachTo: document.body
    })

    await flushPromises()

    const playBtn = wrapper.find('.player-container')
    expect(playBtn.exists()).toBe(true)

    await playBtn.trigger('click')
    await flushPromises()

    expect(wrapper.findComponent({ name: 'VideoPlayer' }).exists()).toBe(true)

    wrapper.unmount()
  })

  it.each(['success', 'failure'])('mounts the ad player immediately while resolving main stream (%s)', async (outcome) => {
    vi.mocked(apiClient.getMovie).mockResolvedValueOnce({
      id: 'movie-123', title: 'Stable Movie', original_title: '', year: 2024,
      poster: '/poster.jpg', rating: null, runtime: 90, quality: 'HD',
      status: 'available', genres: [], overview: 'Stable description', backdrop: null,
      tmdb_id: null, mime_type: 'video/mp4', file_size: 1000000
    })
    vi.mocked(apiClient.getAudioTracks).mockResolvedValueOnce([])
    vi.mocked(apiClient.getCurrentUser).mockResolvedValue({ id: 'u1', username: 'viewer' } as any)
    vi.mocked(apiClient.stopPlayback).mockResolvedValue({ ok: true })
    useAuthStore().setToken('test-token')
    let resolveStart!: (value: any) => void
    let rejectStart!: (error: Error) => void
    vi.mocked(apiClient.startPlayback).mockReturnValueOnce(new Promise((resolve, reject) => {
      resolveStart = resolve
      rejectStart = reject
    }))
    const wrapper = mount(MovieDetailsView, { global: { plugins: [router] } })
    await flushPromises()
    expect(apiClient.startPlayback).not.toHaveBeenCalled()
    const content = wrapper.find('.main-content').element
    await wrapper.find('.player-container').trigger('click')
    expect(apiClient.startPlayback).toHaveBeenCalledTimes(1)
    expect(wrapper.findComponent({name:'VideoPlayer'}).exists()).toBe(true)
    expect(wrapper.findComponent({name:'VideoPlayer'}).props('src')).toBe('')
    expect(wrapper.find('.main-content').element).toBe(content)
    expect(wrapper.find('.player-container').exists()).toBe(true) // keep splash; do not request ads before authorization
    expect(wrapper.findComponent({name:'VideoPlayer'}).props('requested')).toBe(false)
    expect(router.currentRoute.value.fullPath).toBe('/movies/movie-123')
    if (outcome === 'success') {
      resolveStart({ session_id: 's1', media_url: 'https://media.example/stream', heartbeat_interval_seconds: 30 })
    } else {
      rejectStart(new Error('Node unavailable'))
    }
    await flushPromises()
    expect(wrapper.find('.main-content').element).toBe(content)
    if (outcome === 'success') {
      expect(wrapper.findComponent({ name: 'VideoPlayer' }).exists()).toBe(true)
    } else {
      expect(wrapper.find('.player-container').exists()).toBe(true)
      expect(wrapper.text()).toContain('Node unavailable')
      expect(wrapper.find('.player-container').attributes('aria-busy')).toBe('false')
    }
    wrapper.unmount()
  })

  it('renders 404 state when getMovie returns 404 ApiError', async () => {
    vi.mocked(apiClient.getMovie).mockRejectedValueOnce(new ApiError(404, 'Movie not found'))

    const wrapper = mount(MovieDetailsView, {
      global: { plugins: [router] }
    })

    await flushPromises()

    expect(wrapper.find('.not-found-state').exists()).toBe(true)
    expect(wrapper.text()).toContain('Movie Not Found')
  })
  async function compatibilityFixture() {
    vi.mocked(apiClient.getMovie).mockResolvedValueOnce({
      id: 'movie-123', title: 'Codec fixture', year: 2024, poster: null,
      rating: null, runtime: 90, status: 'available', genres: [], overview: ''
    } as any)
    vi.mocked(apiClient.getAudioTracks).mockResolvedValueOnce([])
    vi.mocked(apiClient.getCurrentUser).mockResolvedValue({id:'u1',username:'viewer'} as any)
    vi.mocked(apiClient.stopPlayback).mockResolvedValue({ok:true})
    useAuthStore().setToken('test-token')
    const w=mount(MovieDetailsView,{global:{plugins:[router]}})
    await flushPromises()
    return w
  }

  it('does not diagnose an idle empty video element as an unsupported codec',async()=>{
    const w=await compatibilityFixture()
    w.findComponent({name:'VideoPlayer'}).vm.$emit('media-error',4)
    await flushPromises()
    expect(w.find('.compatibility').exists()).toBe(false)
    expect(w.find('.player-container').exists()).toBe(true)
    expect(apiClient.stopPlayback).not.toHaveBeenCalled()
    w.unmount()
  })

  it('renders the structured browser codec warning with the profile link',async()=>{
    const w=await compatibilityFixture()
    vi.mocked(apiClient.diagnosePlayback).mockResolvedValue({state:'available'})
    vi.mocked(apiClient.startPlayback).mockRejectedValueOnce(Object.assign(new Error('Unsupported'),{
      status:409,detail:{code:'BROWSER_MEDIA_UNSUPPORTED'}
    }))
    await w.find('.player-container').trigger('click');await flushPromises()
    expect(w.find('.compatibility').exists()).toBe(true)
    expect(w.find('.compatibility a').attributes('href')).toBe('/profile#desktop-player')
    expect(w.find('.inline-error').exists()).toBe(false)
    w.unmount()
  })

  it.each([2,3,4])('releases the lease on native video error %s and distinguishes network failure',async(code)=>{
    const w=await compatibilityFixture()
    vi.mocked(apiClient.startPlayback).mockResolvedValueOnce({
      session_id:'codec-session',media_url:'https://media.invalid/fixture',heartbeat_interval_seconds:30
    } as any)
    await w.find('.player-container').trigger('click');await flushPromises()
    w.findComponent({name:'VideoPlayer'}).vm.$emit('media-error',code)
    await flushPromises()
    expect(apiClient.stopPlayback).toHaveBeenCalledWith('codec-session',{})
    expect(w.find('.compatibility').exists()).toBe(code===3||code===4)
    if(code===2)expect(w.text()).toContain('проверьте соединение')
    w.unmount()
  })

  it.each([3,4])('confirmed missing file is never advertised as a codec problem (%s)', async(code)=>{
    const w=await compatibilityFixture()
    vi.mocked(apiClient.startPlayback).mockResolvedValueOnce({session_id:'missing',media_url:'https://media.invalid/fixture'} as any)
    vi.mocked(apiClient.diagnosePlayback).mockResolvedValueOnce({state:'unavailable',code:'MEDIA_UNAVAILABLE'})
    await w.find('.player-container').trigger('click');await flushPromises()
    w.findComponent({name:'VideoPlayer'}).vm.$emit('media-error',code);await flushPromises()
    expect(w.find('.playback-unavailable').text()).toContain('Фильм больше недоступен на сайте')
    expect(w.find('.compatibility').exists()).toBe(false)
    expect(w.find('.playback-unavailable').text()).not.toContain('подписк')
    w.unmount()
  })
  it('a temporary source-check error never claims the film was deleted or codecs are incompatible',async()=>{
    const w=await compatibilityFixture()
    vi.mocked(apiClient.startPlayback).mockResolvedValueOnce({session_id:'temporary',media_url:'https://media.invalid/fixture'} as any)
    vi.mocked(apiClient.diagnosePlayback).mockResolvedValueOnce({state:'temporary'})
    await w.find('.player-container').trigger('click');await flushPromises()
    w.findComponent({name:'VideoPlayer'}).vm.$emit('media-error',4);await flushPromises()
    expect(w.find('.playback-unavailable').exists()).toBe(false)
    expect(w.find('.compatibility').exists()).toBe(false)
    expect(w.text()).toContain('Попробуйте позднее или проверьте соединение')
    w.unmount()
  })

  it('shows ordered split parts and binds each playback to its own source', async () => {
    vi.mocked(apiClient.getMovie).mockResolvedValueOnce({
      id:'movie-123',title:'Палмер',original_title:'Palmer',year:2021,poster:null,
      rating:null,runtime:110,quality:'SD',status:'available',genres:[],overview:'',
      backdrop:null,tmdb_id:458220,mime_type:'video/mp4',file_size:993820947,
      parts:[{source_id:'part-1',number:1,total:2},{source_id:'part-2',number:2,total:2}]
    })
    vi.mocked(apiClient.getAudioTracks).mockResolvedValue([])
    vi.mocked(apiClient.getCurrentUser).mockResolvedValue({id:'u1',username:'viewer'} as any)
    vi.mocked(apiClient.stopPlayback).mockResolvedValue({ok:true})
    vi.mocked(apiClient.startPlayback).mockResolvedValue({session_id:'parts-session',media_endpoint:'/media',playback_token:'fixture',node_id:'n',media_url:'/fixture.mp4',heartbeat_interval_seconds:30})
    useAuthStore().setToken('test-token')
    const wrapper=mount(MovieDetailsView,{global:{plugins:[router]}})
    await flushPromises()
    expect(wrapper.findAll('.movie-part-buttons button').map(b=>b.text())).toEqual(['Часть 1 из 2','Часть 2 из 2'])
    expect(apiClient.startPlayback).not.toHaveBeenCalled()
    await wrapper.find('.player-container').trigger('click');await flushPromises()
    expect(apiClient.startPlayback).toHaveBeenLastCalledWith('movie-123','part-1')
    await wrapper.findAll('.movie-part-buttons button')[1]!.trigger('click');await flushPromises()
    expect(apiClient.stopPlayback).toHaveBeenCalledWith('parts-session')
    expect(apiClient.startPlayback).toHaveBeenLastCalledWith('movie-123','part-2')
    expect(wrapper.findAll('.movie-part-buttons button')[1]!.attributes('aria-pressed')).toBe('true')
    wrapper.unmount()
  })

  it('shows premium access guidance inside the player without raw JSON or premature ads',async()=>{
    const w=await compatibilityFixture()
    vi.mocked(apiClient.startPlayback).mockRejectedValueOnce({status:403,message:'{"code":"entitlement_required","entitlement":"content:premium"}',detail:{code:'entitlement_required',entitlement:'content:premium'}})
    await w.find('.player-container').trigger('click');await flushPromises()
    expect(w.find('.subscription-player').exists()).toBe(true)
    expect(w.text()).toContain('Этот фильм доступен по подписке')
    expect(w.find('.subscription-primary').attributes('href')).toBe('/profile?tab=billing')
    expect(w.find('.subscription-secondary').attributes('href')).toBe('/movies')
    expect(w.find('.inline-error').exists()).toBe(false)
    expect(w.text()).not.toContain('entitlement_required')
    expect(w.find('.player-container').exists()).toBe(false)
    expect(w.findComponent({name:'VideoPlayer'}).props('requested')).toBe(false)
    expect(apiClient.diagnosePlayback).not.toHaveBeenCalled()
    w.unmount()
  })
  it.each([401,403,500])('does not mislabel unrelated %s errors as a subscription requirement',async(status)=>{
    const w=await compatibilityFixture()
    vi.mocked(apiClient.startPlayback).mockRejectedValueOnce({status,message:'Playback temporarily unavailable',detail:{code:'other'}})
    await w.find('.player-container').trigger('click');await flushPromises()
    expect(w.find('.subscription-player').exists()).toBe(false)
    if(status!==401)expect(w.text()).toContain('Playback temporarily unavailable')
    w.unmount()
  })

})
