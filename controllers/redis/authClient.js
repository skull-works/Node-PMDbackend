const redis = require('redis');
const { promisify } = require('util');
require('dotenv').config();

let redisHost = process.env.REDISHOST || process.env.HOST || 'localhost';
let redisPort = process.env.REDISPORT || 6379;
let redisExpire = process.env.REDISEXPIRE || 120;

let redisOptions = {
    host: redisHost,
    port: redisPort
}

const client = redis.createClient(redisOptions);
let get = promisify(client.get).bind(client);
let del = promisify(client.del).bind(client);

const setCLient = async (key, value, csrfToken) => {
    let getVal = await get(key);
    if(getVal) {
        let nil = await del(key);
        console.log('Deleting Current Token - setCLient() ...');
        if(nil === 1){
            console.log('Deleted Current Token - setCLient() ...');
            console.log('Setting new Token - setClient() ...');
            return client.set(key, value, 'EX', redisExpire, async (err, value) => {
                if(err || value !== 'OK') {
                    console.log('Unable to set client and value - setClient() ...');
                    return {error: {message: 'unable to set client and value', statusCode: 500}};
                }
                console.log('Setting new Token Successful - setClient() ...');
                keyCsrf = key + 'Csrf';
                let nil = await del(keyCsrf);
                console.log('Deleting Current UserCsrf - setCLient() ...');
                if(nil === 1) {
                    console.log('Deleted Current UserCsrf - setCLient() ...');
                    console.log('Setting UserCsrf in redis - setClient() ...');
                    client.set(keyCsrf, csrfToken, 'EX', redisExpire, (err, value) =>{
                        if(err || value !== 'OK') {
                            console.log('Unable to set client and value for csrf token in redis - setClient() ...');
                            return {error: {message: 'unable to set client and value for csrf token in redis', statusCode: 500}};
                        }
                        console.log('Setting new UserCsrf Successful - setClient() ...');
                    });
                }
                else {
                    console.log('Was not able to delete current UserCsrf in Redis - setCLient() ...');
                    return {error: {message: 'Was not able to delete current UserCsrf in Redis ...', statusCode: 500}};
                }
            });
        }
        console.log('Was not able to delete current token to replace it - setCLient() ...');
        return {error: {message: 'was not able to delete current token to replace it', statusCode: 500}};
    }

    return client.set(key, value, 'EX', redisExpire, (err, value) => {
        if(err || value !== 'OK') {
            return {error: {message: 'unable to set client and value', statusCode: 500}};
        }
        keyCsrf = key + 'Csrf';
        client.set(keyCsrf, csrfToken, 'EX', redisExpire, (err, value) =>{
            if(err || value !== 'OK') {
                return {error: {message: 'unable to set client and value for csrf token in redis', statusCode: 500}};
            }
        });
    });
};

const isClientValid = async (key, Cookietoken) => {
    try{
        let value = await get(key);
        if(!value) {
            throw({
                message: 'Session timed out, kindly login again',
                statusCode: 403
            });
        }
        if(value !== Cookietoken){ // if token already used
            throw({
                message: 'Login seems to be used already, kindly login ASAP and contact system administrator',
                statusCode: 403
            });
        }
        keyCsrf = key + 'Csrf';
        let clientCsrf = await get(keyCsrf);
        if(!value) {
            throw({
                message: 'csrf in Redis not existing!',
                statusCode: 403
            });
        }

        return { clientCsrf };
    }catch(err){
        return {error:err};
    }
}

const removeClient = async (key) => {
    try{
        let getVal = await get(key);
        if(getVal){
            let nil = await del(key);
            if( nil === 1 ){
                return { logout: true, message: "User is logged out" };
            }
            return { logout: false, message: "Something went wrong, User was unable be logged out, contact administrator" };
        }
        return { message: "User already logged out" };
    }catch(err){
        return {error: err}
    }
}


module.exports = {
    setCLient,
    isClientValid,
    removeClient
};