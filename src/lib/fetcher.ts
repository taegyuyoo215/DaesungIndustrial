/** SWR 전용 fetcher */
export const fetcher = (url: string) =>
  fetch(url).then(res => {
    if (!res.ok) throw new Error(`API 오류: ${res.status}`)
    return res.json()
  })
