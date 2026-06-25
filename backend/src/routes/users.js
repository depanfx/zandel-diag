const router = require('express').Router();
const { listUsers, createUser, updateUser, deactivateUser } = require('../controllers/userController');
const { requireAuth, requireSuperAdmin } = require('../middleware/auth');

router.use(requireAuth, requireSuperAdmin);

router.get('/', listUsers);
router.post('/', createUser);
router.patch('/:id', updateUser);
router.delete('/:id', deactivateUser);

module.exports = router;
