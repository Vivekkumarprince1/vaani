require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../lib/models/User');
const connectDB = require('../lib/db');

async function createOrPromoteAdmin() {
  const args = process.argv.slice(2);
  
  const mobileNumber = args[0] || process.env.SUPERADMIN_MOBILE || '9999999999';
  const password = args[1] || process.env.SUPERADMIN_PASSWORD || 'Admin@12345';
  const username = args[2] || process.env.SUPERADMIN_USERNAME || 'superadmin';
  const role = args[3] || 'superadmin';

  if (!['admin', 'superadmin'].includes(role)) {
    console.error('❌ Role must be either "admin" or "superadmin"');
    process.exit(1);
  }

  console.log(`Connecting to MongoDB to configure ${role}...`);
  await connectDB();

  let user = await User.findOne({ mobileNumber });

  if (user) {
    console.log(`User with mobile ${mobileNumber} already exists. Updating role to "${role}"...`);
    user.role = role;
    user.isActive = true;
    if (password) {
      user.password = await bcrypt.hash(password, 10);
    }
    await user.save();
    console.log(`✅ User "${user.username}" (Mobile: ${user.mobileNumber}) successfully promoted to ${role}!`);
  } else {
    console.log(`Creating new ${role} account for "${username}" (Mobile: ${mobileNumber})...`);
    const hashedPassword = await bcrypt.hash(password, 10);
    user = await User.create({
      username,
      mobileNumber,
      password: hashedPassword,
      role,
      isActive: true,
      preferredLanguage: 'en'
    });
    console.log(`✅ ${role} account created successfully!`);
    console.log(`   Username: ${user.username}`);
    console.log(`   Mobile:   ${user.mobileNumber}`);
    console.log(`   Role:     ${user.role}`);
  }

  await mongoose.disconnect();
  process.exit(0);
}

createOrPromoteAdmin().catch(err => {
  console.error('❌ Error creating/promoting admin:', err);
  process.exit(1);
});
