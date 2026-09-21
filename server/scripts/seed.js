require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../lib/models/User');
const Room = require('../lib/models/Room');
const ProviderConfig = require('../lib/models/ProviderConfig');
const { encrypt } = require('../lib/crypto');
const connectDB = require('../lib/db');

async function seedDatabase() {
  console.log('🌱 Starting Vaani database seed...');
  await connectDB();

  // ─────────────────────────────────────────────────────────────
  // 1. Seed Users (Superadmin, Admin, Demo Multilingual Users)
  // ─────────────────────────────────────────────────────────────
  console.log('👤 Seeding accounts with RBAC roles...');

  const defaultPassword = await bcrypt.hash('Admin@12345', 10);
  const superadminPassword = process.env.SUPERADMIN_PASSWORD 
    ? await bcrypt.hash(process.env.SUPERADMIN_PASSWORD, 10) 
    : defaultPassword;

  const usersData = [
    {
      username: process.env.SUPERADMIN_USERNAME || 'superadmin',
      mobileNumber: process.env.SUPERADMIN_MOBILE || '9999999999',
      password: superadminPassword,
      role: 'superadmin',
      preferredLanguage: 'en',
      email: 'superadmin@vaani.internal',
      status: 'online',
      isActive: true
    },
    {
      username: 'admin',
      mobileNumber: '8888888888',
      password: defaultPassword,
      role: 'admin',
      preferredLanguage: 'en',
      email: 'admin@vaani.internal',
      status: 'offline',
      isActive: true
    },
    {
      username: 'alice_en',
      mobileNumber: '1111111111',
      password: defaultPassword,
      role: 'user',
      preferredLanguage: 'en',
      email: 'alice@example.com',
      status: 'online',
      isActive: true
    },
    {
      username: 'rohit_hi',
      mobileNumber: '2222222222',
      password: defaultPassword,
      role: 'user',
      preferredLanguage: 'hi',
      email: 'rohit@example.com',
      status: 'online',
      isActive: true
    },
    {
      username: 'carlos_es',
      mobileNumber: '3333333333',
      password: defaultPassword,
      role: 'user',
      preferredLanguage: 'es',
      email: 'carlos@example.com',
      status: 'offline',
      isActive: true
    },
    {
      username: 'yuki_ja',
      mobileNumber: '4444444444',
      password: defaultPassword,
      role: 'user',
      preferredLanguage: 'ja',
      email: 'yuki@example.com',
      status: 'offline',
      isActive: true
    }
  ];

  const seededUsers = [];
  for (const u of usersData) {
    let user = await User.findOne({ mobileNumber: u.mobileNumber });
    if (user) {
      user.role = u.role;
      user.isActive = u.isActive;
      user.preferredLanguage = u.preferredLanguage;
      await user.save();
      console.log(`   Updated user: ${user.username} (${user.mobileNumber}) -> ${user.role}`);
    } else {
      user = await User.create(u);
      console.log(`   Created user: ${user.username} (${user.mobileNumber}) -> ${user.role}`);
    }
    seededUsers.push(user);
  }

  // Cross-link contacts so users can immediately call & message each other
  const allUserIds = seededUsers.map(u => u._id);
  for (const user of seededUsers) {
    const otherIds = allUserIds.filter(id => !id.equals(user._id));
    user.contacts = otherIds;
    await user.save();
  }
  console.log('✅ Contact lists populated for all demo users.');

  // ─────────────────────────────────────────────────────────────
  // 2. Seed Default Provider Configurations & Architecture Pipelines
  // ─────────────────────────────────────────────────────────────
  console.log('⚙️ Seeding Provider Configurations (Version A & Version B)...');

  const providerConfigs = [
    {
      category: 'pipeline',
      activeProvider: 'versionB_pipeline',
      providers: {
        versionA_realtime: {
          name: 'Version A — Fastest MVP (Direct Realtime Audio)',
          description: 'Microphone → GPT-Realtime-Translate → Speaker',
          isConfigured: Boolean(process.env.OPENAI_API_KEY)
        },
        versionB_pipeline: {
          name: 'Version B — Maximum Control (Modular Pipeline)',
          description: 'Microphone → Streaming STT (Deepgram/Azure) → Translation LLM (GPT/Azure) → Streaming TTS (ElevenLabs/Azure) → Speaker',
          isConfigured: true
        }
      }
    },
    {
      category: 'realtime',
      activeProvider: 'openai',
      providers: {
        openai: {
          name: 'OpenAI GPT Realtime Speech-to-Speech',
          apiKey: process.env.OPENAI_API_KEY ? encrypt(process.env.OPENAI_API_KEY) : '',
          model: 'gpt-4o-realtime-preview',
          voice: 'alloy',
          instructions: 'You are an ultra-low-latency real-time multilingual speech translator. Listen to audio and respond directly with natural translated speech in the target language.',
          isConfigured: Boolean(process.env.OPENAI_API_KEY)
        }
      }
    },
    {
      category: 'stt',
      activeProvider: 'azure',
      providers: {
        azure: {
          name: 'Azure Speech Recognition',
          apiKey: process.env.AZURE_SPEECH_KEY ? encrypt(process.env.AZURE_SPEECH_KEY) : '',
          region: process.env.AZURE_SPEECH_REGION || '',
          endpoint: process.env.AZURE_SPEECH_ENDPOINT || '',
          isConfigured: Boolean(process.env.AZURE_SPEECH_KEY)
        },
        groq: {
          name: 'Groq Whisper (Lightning-Fast STT)',
          apiKey: process.env.GROQ_API_KEY ? encrypt(process.env.GROQ_API_KEY) : '',
          model: 'whisper-large-v3-turbo',
          isConfigured: Boolean(process.env.GROQ_API_KEY)
        },
        deepgram: {
          name: 'Deepgram Nova-2 Streaming STT',
          apiKey: process.env.DEEPGRAM_API_KEY ? encrypt(process.env.DEEPGRAM_API_KEY) : '',
          model: 'nova-2',
          isConfigured: Boolean(process.env.DEEPGRAM_API_KEY)
        },
        nvidia: {
          name: 'NVIDIA Riva / Canary STT',
          apiKey: process.env.NVIDIA_API_KEY ? encrypt(process.env.NVIDIA_API_KEY) : '',
          model: 'nvidia/canary-1b',
          endpoint: 'https://integrate.api.nvidia.com/v1',
          isConfigured: Boolean(process.env.NVIDIA_API_KEY)
        },
        openai: {
          name: 'OpenAI Whisper',
          apiKey: process.env.OPENAI_API_KEY ? encrypt(process.env.OPENAI_API_KEY) : '',
          model: 'whisper-1',
          isConfigured: Boolean(process.env.OPENAI_API_KEY)
        }
      }
    },
    {
      category: 'translation',
      activeProvider: 'azure',
      providers: {
        azure: {
          name: 'Azure Translator',
          apiKey: process.env.AZURE_TRANSLATOR_KEY ? encrypt(process.env.AZURE_TRANSLATOR_KEY) : '',
          region: process.env.AZURE_TRANSLATOR_REGION || '',
          endpoint: process.env.AZURE_TRANSLATOR_ENDPOINT || 'https://api.cognitive.microsofttranslator.com',
          isConfigured: Boolean(process.env.AZURE_TRANSLATOR_KEY)
        },
        groq: {
          name: 'Groq (Ultra-Fast LPU Inference)',
          apiKey: process.env.GROQ_API_KEY ? encrypt(process.env.GROQ_API_KEY) : '',
          model: 'llama-3.3-70b-versatile',
          endpoint: 'https://api.groq.com/openai/v1',
          isConfigured: Boolean(process.env.GROQ_API_KEY)
        },
        openrouter: {
          name: 'OpenRouter (Universal Model Gateway)',
          apiKey: process.env.OPENROUTER_API_KEY ? encrypt(process.env.OPENROUTER_API_KEY) : '',
          model: 'meta-llama/llama-3.3-70b-instruct',
          endpoint: 'https://openrouter.ai/api/v1',
          isConfigured: Boolean(process.env.OPENROUTER_API_KEY)
        },
        nvidia: {
          name: 'NVIDIA NIM (High-Performance LLM)',
          apiKey: process.env.NVIDIA_API_KEY ? encrypt(process.env.NVIDIA_API_KEY) : '',
          model: 'meta/llama-3.3-70b-instruct',
          endpoint: 'https://integrate.api.nvidia.com/v1',
          isConfigured: Boolean(process.env.NVIDIA_API_KEY)
        },
        openai: {
          name: 'OpenAI (GPT-4o mini)',
          apiKey: process.env.OPENAI_API_KEY ? encrypt(process.env.OPENAI_API_KEY) : '',
          model: 'gpt-4o-mini',
          isConfigured: Boolean(process.env.OPENAI_API_KEY)
        },
        google: {
          name: 'Google Cloud Translation',
          apiKey: process.env.GOOGLE_TRANSLATE_API_KEY ? encrypt(process.env.GOOGLE_TRANSLATE_API_KEY) : '',
          isConfigured: Boolean(process.env.GOOGLE_TRANSLATE_API_KEY)
        }
      }
    },
    {
      category: 'tts',
      activeProvider: 'azure',
      providers: {
        azure: {
          name: 'Azure Neural TTS',
          apiKey: process.env.AZURE_SPEECH_KEY ? encrypt(process.env.AZURE_SPEECH_KEY) : '',
          region: process.env.AZURE_SPEECH_REGION || '',
          endpoint: process.env.AZURE_SPEECH_ENDPOINT || '',
          isConfigured: Boolean(process.env.AZURE_SPEECH_KEY)
        },
        elevenlabs: {
          name: 'ElevenLabs Multilingual TTS',
          apiKey: process.env.ELEVENLABS_API_KEY ? encrypt(process.env.ELEVENLABS_API_KEY) : '',
          voiceId: '21m00Tcm4TlvDq8ikWAM',
          model: 'eleven_multilingual_v2',
          isConfigured: Boolean(process.env.ELEVENLABS_API_KEY)
        },
        nvidia: {
          name: 'NVIDIA Riva FastPitch TTS',
          apiKey: process.env.NVIDIA_API_KEY ? encrypt(process.env.NVIDIA_API_KEY) : '',
          voiceId: 'English-US.Female-1',
          endpoint: 'https://integrate.api.nvidia.com/v1',
          isConfigured: Boolean(process.env.NVIDIA_API_KEY)
        },
        openai: {
          name: 'OpenAI TTS',
          apiKey: process.env.OPENAI_API_KEY ? encrypt(process.env.OPENAI_API_KEY) : '',
          model: 'tts-1',
          voice: 'alloy',
          isConfigured: Boolean(process.env.OPENAI_API_KEY)
        }
      }
    },
    {
      category: 'sfu',
      activeProvider: 'livekit',
      providers: {
        livekit: {
          name: 'LiveKit SFU',
          url: process.env.LIVEKIT_URL || 'ws://localhost:7880',
          apiKey: process.env.LIVEKIT_API_KEY ? encrypt(process.env.LIVEKIT_API_KEY) : '',
          apiSecret: process.env.LIVEKIT_API_SECRET ? encrypt(process.env.LIVEKIT_API_SECRET) : '',
          isConfigured: Boolean(process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET)
        }
      }
    }
  ];

  for (const pc of providerConfigs) {
    await ProviderConfig.findOneAndUpdate(
      { category: pc.category },
      {
        category: pc.category,
        activeProvider: pc.activeProvider,
        providers: pc.providers,
        updatedBy: seededUsers[0]._id
      },
      { upsert: true, new: true }
    );
    console.log(`   Seeded config category: [${pc.category}] -> active: ${pc.activeProvider}`);
  }
  console.log('✅ Provider configurations seeded.');

  // ─────────────────────────────────────────────────────────────
  // 3. Seed Demo Group Call / Chat Room
  // ─────────────────────────────────────────────────────────────
  const demoRoomName = 'Global Multilingual Lounge';
  let demoRoom = await Room.findOne({ name: demoRoomName });
  if (!demoRoom) {
    demoRoom = await Room.create({
      name: demoRoomName,
      description: 'Open discussion room for testing real-time multilingual speech translation',
      participants: allUserIds,
      createdBy: seededUsers[0]._id,
      admins: [seededUsers[0]._id, seededUsers[1]._id],
      roomType: 'group',
      isActive: true
    });
    console.log(`✅ Created demo room: "${demoRoom.name}"`);
  } else {
    demoRoom.participants = allUserIds;
    await demoRoom.save();
    console.log(`✅ Demo room "${demoRoom.name}" participants refreshed.`);
  }

  console.log('\n🎉 Database seed completed successfully!');
  console.log('──────────────────────────────────────────────────────');
  console.log('🔑 Seeded Credentials:');
  console.log(`   👑 Superadmin:  Mobile: ${seededUsers[0].mobileNumber}  | Pass: Admin@12345`);
  console.log(`   🛡️ Admin:       Mobile: ${seededUsers[1].mobileNumber}  | Pass: Admin@12345`);
  console.log(`   🗣️ Alice (EN):   Mobile: 1111111111       | Pass: Admin@12345`);
  console.log(`   🗣️ Rohit (HI):   Mobile: 2222222222       | Pass: Admin@12345`);
  console.log(`   🗣️ Carlos (ES):  Mobile: 3333333333       | Pass: Admin@12345`);
  console.log(`   🗣️ Yuki (JA):    Mobile: 4444444444       | Pass: Admin@12345`);
  console.log('──────────────────────────────────────────────────────');

  await mongoose.disconnect();
  process.exit(0);
}

seedDatabase().catch(err => {
  console.error('❌ Error seeding database:', err);
  process.exit(1);
});
