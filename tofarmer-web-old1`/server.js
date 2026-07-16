const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws');
const algosdk = require('algosdk');
const jwt = require('jsonwebtoken');

dotenv.config({
  path: '.env.mainnet'
});

console.log("SUPABASE_URL =", process.env.SUPABASE_URL);

const app = express();

// ===================== MIDDLEWARE =====================
app.use(cors());
app.use(express.json());

// ===================== DATABASE (SUPABASE) =====================
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
    {
        realtime: {
            transport: WebSocket
        }
    }
);

// ===================== ALGORAND MAINNET =====================
const algodClient = new algosdk.Algodv2(
    '', // No token needed for public node
    process.env.ALGOD_SERVER,
    process.env.ALGOD_PORT
);

const TOF_ASA_ID = parseInt(process.env.TOF_ASA_ID);

// ===================== AUTH MIDDLEWARE =====================
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Token tidak ditemukan' });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Token tidak valid' });
        req.user = user;
        next();
    });
};

// ===================== ROUTES: AUTH =====================
app.post('/api/auth/login', async (req, res) => {
    try {
        const { address, network, walletType } = req.body;

        if (network !== 'mainnet') {
            return res.status(400).json({ error: 'Hanya mainnet yang didukung' });
        }

        // Validate address format
        if (!algosdk.isValidAddress(address)) {
            return res.status(400).json({ error: 'Alamat Algorand tidak valid' });
        }

        // Check or create user (UNIQUE MAINNET TABLE)
        let { data: user, error } = await supabase
            .from('tofarmer_users_mainnet')
            .select('*')
            .eq('wallet_address', address)
            .single();

        if (error && error.code !== 'PGRST116') throw error;

        if (!user) {
            // Create new user
            const { data: newUser, error: createError } = await supabase
                .from('tofarmer_users_mainnet')
                .insert([{
                    wallet_address: address,
                    username: `Petani ${address.slice(0, 8)}`,
                    reputation_score: 0,
                    total_tof_earned: 0,
                    wallet_type: walletType,
                    created_at: new Date().toISOString()
                }])
                .select()
                .single();

            if (createError) throw createError;
            user = newUser;
        }

        // Get TOF balance from Algorand
        let tofBalance = 0;
        try {
            const accountInfo = await algodClient.accountInformation(address).do();
            const tofAsset = accountInfo.assets?.find(a => a['asset-id'] === TOF_ASA_ID);
            tofBalance = tofAsset ? tofAsset.amount / 1_000_000 : 0;
        } catch (error) {
            console.log('Could not fetch TOF balance:', error);
        }

        // Generate JWT
        const token = jwt.sign(
            { id: user.id, wallet: address },
            process.env.JWT_SECRET,
            { expiresIn: '30d' }
        );

        res.json({
            token,
            user: {
                id: user.id,
                username: user.username,
                wallet: address,
                points: user.total_tof_earned || 0,
                tofBalance: tofBalance,
                rank: user.rank || null,
                walletType: walletType
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ===================== ROUTES: MINING - MEMORY SUBMIT =====================
app.post('/api/mining/memory/submit', authenticateToken, async (req, res) => {
    try {
        const { data } = req.body;

        // Validate data
        if (!data.tanggal || !data.komoditas || !data.hasil) {
            return res.status(400).json({ error: 'Data tidak lengkap' });
        }

        // Insert to UNIQUE MAINNET TABLE
        const { data: activity, error } = await supabase
            .from('tofarmer_mining_mainnet')
            .insert([{
                user_id: req.user.id,
                activity_type: 'memory',
                data: data,
                status: 'submitted',
                tof_reward: 0,
                created_at: new Date().toISOString()
            }])
            .select()
            .single();

        if (error) throw error;

        // AI Oracle validation (simulated)
        const baseReward = 50;
        const detailBonus = (data.catatan ? 30 : 0) + (data.ph ? 20 : 0);
        const qualityBonus = Math.floor(Math.random() * 20);
        const reward = baseReward + detailBonus + qualityBonus;

        // Update activity with reward
        await supabase
            .from('tofarmer_mining_mainnet')
            .update({ 
                status: 'approved',
                tof_reward: reward
            })
            .eq('id', activity.id);

        // TODO: Mint TOF on Algorand via Treasury multisig
        // This would be called to actual Algorand blockchain

        res.json({ 
            success: true,
            activity_id: activity.id,
            reward: reward,
            message: 'Catatan diterima dan divalidasi!'
        });
    } catch (error) {
        console.error('Mining error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ===================== ROUTES: GET USER STATS =====================
app.get('/api/users/:wallet/stats', authenticateToken, async (req, res) => {
    try {
        const { wallet } = req.params;

        const { data: user } = await supabase
            .from('tofarmer_users_mainnet')
            .select('*')
            .eq('wallet_address', wallet)
            .single();

        if (!user) {
            return res.status(404).json({ error: 'User tidak ditemukan' });
        }

        const { data: activities } = await supabase
            .from('tofarmer_mining_mainnet')
            .select('*')
            .eq('user_id', user.id);

        const memoryActivities = activities.filter(a => a.activity_type === 'memory');
        const computeActivities = activities.filter(a => a.activity_type === 'compute');
        const verifyActivities = activities.filter(a => a.activity_type === 'verify');

        res.json({
            memoryPoints: memoryActivities.reduce((sum, a) => sum + (a.tof_reward || 0), 0),
            memoryCount: memoryActivities.length,
            computePoints: computeActivities.reduce((sum, a) => sum + (a.tof_reward || 0), 0),
            computeCount: computeActivities.length,
            verifyPoints: verifyActivities.reduce((sum, a) => sum + (a.tof_reward || 0), 0),
            verifyCount: verifyActivities.length
        });
    } catch (error) {
        console.error('Get stats error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ===================== HEALTH CHECK =====================
app.get('/health', (req, res) => {
    res.json({ status: 'OK', network: 'mainnet', tofarmer: 'LIVE' });
});

// ===================== START SERVER =====================
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`🌾 ToFarmer Backend MAINNET running on port ${PORT}`);
    console.log(`📊 TOF ASA ID: ${TOF_ASA_ID}`);
    console.log(`🔗 Network: Algorand Mainnet`);
});