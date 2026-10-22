/** Only the approved Media Node may supply video bytes. Never proxy via the control plane. */
export function nodeMediaUrl(value: string): string {
  const u = new URL(value)
  if (u.protocol !== 'https:' || u.origin !== 'https://node-1.scenrix.com' || u.username || u.password) throw Error('Видео недоступно: адрес не принадлежит Media Node')
  return u.href
}
export function placementBody(d: any) {
  if (!d.creative_id) throw Error('Выберите ролик')
  const individual = d.where === 'videos'
  if (individual && !d.targets.length) throw Error('Выберите хотя бы одно видео')
  if (d.where === 'genre' && d.genre_id == null) throw Error('Выберите жанр')
  const minutes = Number(d.minutes)
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 120) throw Error('Интервал: целое число от 1 до 120 минут')
  const midpoints = individual && d.exact.trim() ? d.exact.split(',').map((v: string) => {
    const s = v.trim(); if (!/^\d{2}:\d{2}:\d{2}$/.test(s)) throw Error('Время: ЧЧ:ММ:СС, через запятую')
    const [h,m,sx] = s.split(':').map(Number); const n=h*3600+m*60+sx
    if (m>59||sx>59||n<=0||n>21600) throw Error('Проверьте время вставки')
    return n
  }) : []
  if (new Set(midpoints).size!==midpoints.length) throw Error('Одинаковые моменты не должны повторяться')
  if (!d.preroll&&!d.postroll&&!minutes&&!midpoints.length) throw Error('Выберите хотя бы одно место показа')
  return {creative_id:d.creative_id,selection:individual?'videos':'group',targets:individual?d.targets.map((v:any)=>({kind:v.kind,id:v.id})):[],scope:individual?'all':d.where==='genre'?d.scope:d.where,genre_id:!individual&&d.where==='genre'?d.genre_id:null,preroll:d.preroll,postroll:d.postroll,interval_sec:minutes*60,midpoints}
}
