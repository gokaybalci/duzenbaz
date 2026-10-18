let navTo: ((page: string) => void) | null = null
export const setNavigator = (f: (page: string) => void) => { navTo = f }
export const navigate = (page: string) => navTo?.(page)
