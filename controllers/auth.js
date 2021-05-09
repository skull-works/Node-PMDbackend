const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const momentZone = require('moment-timezone');
const moment = require('moment');
const { generateAccessToken, generateRefreshToken } = require('./operations/tokens');
const { isClientValid, removeClient } = require('./redis/authClient');
const { authErrors } = require('../middleware/errors/errors');
const { User } = require('../models/index');


require('dotenv').config();
let jwtSecret = process.env.JWTSECRET;

const currentTimeZone = momentZone.tz('Asia/Manila');



exports.generateCSRF = (req, res) => {
    res.status(200).json({csrfToken: req.csrfToken()});
};




exports.signUp = async (req, res, next) => {
    try{
        let signUpInfo = req.body;
        let hashPass = await bcrypt.hash(signUpInfo.password, 12);
        let isUserExist = await User.findOne({ where: { username: signUpInfo.username }});
        if (isUserExist) return res.json({success:false, message: "User already existing"});

        let user = await User.create({
            username: signUpInfo.username,
            password: hashPass,
            authority: signUpInfo.authority
        });
        if(!user) throw({message: "unable to create user"});
        return res.status(200).json({success:true, message: "User created Successfuly"});
    }catch(err){
        console.log(err);
        next(err);
    }
};




exports.Login = async (req, res, next) => {
    let username = req.body.username;
    let password = req.body.password;
    try{
        // Step 1 Extract user from database
        let user = await User.findOne({ where:{ username: username }});
        if(!user) throw({message: 'no user with this username', statusCode: 403});
        
        // Step 2 compare input password to password from database
        let doMatch = await bcrypt.compare(password, user.password);
        if(!doMatch) throw ({message: 'wrong password', statusCode: 403});

        // Step 3 create jwt token
        let token = { name: username };
        let accessToken = await generateAccessToken(token, res);
        let refreshToken = await generateRefreshToken(token, res);
 
        if(accessToken.error) return authErrors(accessToken.error, next);
        if(refreshToken.error) return authErrors(refreshToken.error, next);
        res.status(200).json({isLoggedIn: true, message: 'Login successful'});
    }catch(err){
        next(err);
    }
};




exports.isLoggedIn = (req, res, next) => {
    if( req.signedCookies && req.signedCookies.token ){
        return jwt.verify(req.signedCookies.token, jwtSecret, { ignoreExpiration: true }, async (err, token) => {
            // Check if Access Token is still valid
            if (err) return authErrors({ message: "Invalid Token", statusCode: 403}, next);

            // Check if Current Time is allowed for access
            const format = 'HH:mm:ss';
            const currentTime = moment(currentTimeZone, format);
            const before = 8 * 3600;
            const after = 19 * 3600;
            const currentTimeInSeconds = (currentTime.hours() * 3600) + (currentTime.minutes() * 60);
            console.log('Showing current Time and log check condition - auth.js isLoggedIn Controller ...');
            console.log(`Hours and Minutes now:: ${currentTime.hours()}hr - ${currentTime.minutes()}min`);
            console.log(`Time Log Restriction in seconds::${before}:Before - ${currentTimeInSeconds}:currentTime - ${after}:After`);
            if ((before < currentTimeInSeconds && currentTimeInSeconds < after) || token.name === 'superfe') {
                // Check if Access Token expired 
                if (Date.now() >= (token.exp * 1000)) {
                    let username = token.name;
                    console.log('checking if user still in redis - auth.js isLoggedIn Controller ...');
                    let isValid = await isClientValid(username, req.signedCookies.token); 
                    if(isValid.error) return authErrors(isValid.error, next);
                    console.log('user login still in redis - auth.js isLoggedIn Controller');

                    //  Generate new Access Token
                    console.log('generating new access token in auth.js isLoggedIn Controller ...');
                    let accessToken = await generateAccessToken({name: username, csrf: req.csrfToken()}, res);
                    if(accessToken.error) return authErrors(accessToken.error, next);
                    return res.status(200).json({ csrfToken: req.csrfToken(), isLoggedIn: true });
                }

                let username = token.name;
                console.log('checking if user accessToken still in redis - auth.js isLoggedIn Controller ...');
                let isValid = await isClientValid(username, req.signedCookies.token); 
                if(isValid.error) return authErrors(isValid.error, next);
                console.log('user accessToken still in redis - auth.js isLoggedIn Controller');

                return res.status(200).json({ csrfToken: isValid.clientCsrf,  isLoggedIn: true });
            }
            console.log('Login is not within the TimeRange specified - auth.js isLoggedIn Controller ...');
            return authErrors({ message: 'Login Not Permitted!', statusCode: 403 }, next);
        });
    }
    return res.json({message: 'not logged in'}); 
}




exports.willLogout = (req, res, next) => {
    if( req.signedCookies || req.cookies ){
        if( req.signedCookies.token ){
            return jwt.verify(req.signedCookies.token, jwtSecret, { ignoreExpiration: true }, async (err , token) => {
                let key = token.name;
                console.log('user logging out ...')
                let isLoggedOut = await removeClient(key);  
                console.log('user logged out.')
                return res.status(200).json(isLoggedOut);
            });
        }
        else if( req.signedCookies.token !== undefined || req.cookies.token !== undefined ){
            return res.status(422).json({ warning: true, 
                message: 'Your account session has been tampered!, kindly login in another browser then log out from there' 
            });
        }
        else{
            console.log('user already logged out.')
            return res.status(200).json({ message: "User already logged out" });
        }
    }
    return res.status(422).json({ message: "User already logged out and possibly an invalid user" });
};