import express from 'express'

import { loginUser, logoutUser, redirectUser, googleCallback } from '../controllers/authController'
const router = express.Router()

router.get('/google', redirectUser)
router.get('/google/callback', googleCallback)
router.post('/login', loginUser)
router.post('/logout', logoutUser)
export default router
