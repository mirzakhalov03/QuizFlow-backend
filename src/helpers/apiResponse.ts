export type ApiResponse<T = unknown> = {
  success: boolean
  message: string
  data: T | null
  error: unknown | null
}

export const successResponse = <T>(message: string, data: T): ApiResponse<T> => ({
  success: true,
  message,
  data,
  error: null,
})

export const errorResponse = (
  message: string,
  error: unknown,
  data: null = null,
): ApiResponse<null> => ({
  success: false,
  message,
  data,
  error,
})
