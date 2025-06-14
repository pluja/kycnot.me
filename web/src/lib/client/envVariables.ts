export const DEPLOYMENT_MODE = import.meta.env.PROD
  ? import.meta.env.MODE === 'development' ||
    import.meta.env.MODE === 'staging' ||
    import.meta.env.MODE === 'production'
    ? import.meta.env.MODE
    : 'development'
  : 'development'
