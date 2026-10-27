import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import MovieCard from '../components/MovieCard.vue'
const movie = {id:'movie',title:'Сказка о человеке, колесе и чинаре',year:1974,poster:null,rating:null,type:'movie'} as any
const options = {global:{stubs:{RouterLink:{template:'<a><slot /></a>'},PosterPlay:true}}}
describe('universal KINOSOTA poster fallback',()=>{
 it('shows brand and title without artwork',()=>{
  const w=mount(MovieCard,{...options,props:{movie}})
  expect(w.find('.branded-fallback').text()).toContain('KINOSOTA')
  expect(w.find('.branded-fallback').text()).toContain(movie.title)
  expect(w.find('.poster-img').exists()).toBe(false)
 })
 it('recovers from a broken URL and immediately accepts a replacement',async()=>{
  const w=mount(MovieCard,{...options,props:{movie:{...movie,poster:'https://invalid.example/poster.jpg'}}})
  await w.find('.poster-img').trigger('error')
  expect(w.find('.branded-fallback').text()).toContain('KINOSOTA')
  await w.setProps({movie:{...movie,poster:'/media/posters/manual.jpg?v=2'}})
  expect(w.find('.poster-img').exists()).toBe(true)
  expect(w.find('.branded-fallback').exists()).toBe(false)
 })
})
