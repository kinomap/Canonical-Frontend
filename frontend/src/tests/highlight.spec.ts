import {describe,it,expect} from 'vitest'
import {highlightParts} from '@/utils/highlight'
const marks=(text:string,needles:string[])=>highlightParts(text,needles).filter(part=>part.mark).map(part=>part.text)
describe('highlightParts',()=>{
 it('marks whole words by stem, case and ё insensitive, merging adjacent words only',()=>{
  expect(marks('Тёмный рыцарь: Возрождение легенды',['темный рыцарь'])).toEqual(['Тёмный рыцарь'])
  expect(marks('Бэтмен: Возвращение Тёмного рыцаря',['temniy rycar','тёмный рыцарь'])).toEqual(['Тёмного рыцаря'])
  expect(marks('Доктор Хаус',['хаус'])).toEqual(['Хаус'])
  expect(marks('Рыцарь, рыцарь',['рыцарь'])).toEqual(['Рыцарь','рыцарь'])
 })
 it('keeps the text intact and ignores one-letter needles',()=>{
  const text='Lupin: Пролог'
  expect(highlightParts(text,['lup','п']).map(part=>part.text).join('')).toBe(text)
  expect(marks(text,['п'])).toEqual([])
  expect(highlightParts('',['x'])).toEqual([])
  expect(highlightParts('Без совпадений',[])).toEqual([{text:'Без совпадений',mark:false}])
 })
})
