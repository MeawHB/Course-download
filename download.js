//test
const request = require('request');
const config = require('./config.json');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const https = require('https');
const readline = require('readline');

//读取命令行
function read() {
    return new Promise((resolve, reject) => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            prompt: '请选择课程（数字）：'
        });
        rl.prompt();
        let str = '';
        rl.on('line', (line) => {
            str = line;
            rl.close()
        }).on('close', () => {
            resolve(str)
        });
    });
}


//单行显示
function log(str) {
    //光标上移n1行
    process.stdout.write('\033[1A');
    //\r移动到行首  033[K 清楚光标到行尾
    process.stdout.write('\r\033[K');
    console.log('\x1B[36m%s\x1B[0m', str);
}

//下载视频
function loadvideo(url, filename) {
    var pm = new Promise(function (resolve, reject) {
        https.get(url, function (res) {
            res.setEncoding('binary');
            let length = res.headers['content-length'];
            let video = '';
            console.log('');
            res.on('data', function (data) {
                video += data;
                log(filename + '  ' + (video.length / length * 100).toFixed(2) + '%')
            });
            res.on('end', function () {
                fs.writeFileSync(filename, video, {encoding: 'binary'});
                console.log(filename + '---下载成功');
                resolve(filename + '---下载成功');
            });
        }).on('error', function (e) {
            reject(e)
        });
    });
    return pm;
}


//创建文件夹
function mkdirsSync(dirname) {
    if (fs.existsSync(dirname)) {
        return true;
    } else {
        if (mkdirsSync(path.dirname(dirname))) {
            fs.mkdirSync(dirname);
            return true;
        }
    }
}

// request请求并返回
function send(opts) {
    return new Promise((resolve, reject) => {
        request(opts, function (err, res, body) {
            resolve({
                err: err,
                res: res,
                body: body
            });
        });
    });
}

async function download() {
    //登陆界面获取cookie
    let optslogin = {
        url: 'https://wl.scutde.net/edu3/edu3/login.html',
        method: 'GET',
        headers: {
            'User-Agent': "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:64.0) Gecko/20100101 Firefox/64.0",
        }
    };
    let reslogin = await send(optslogin);

    //post发送用户名密码信息
    let optsform = {
        url: "https://wl.scutde.net/edu3/j_spring_security_check",
        method: 'POST',
        headers: {
            'User-Agent': "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:64.0) Gecko/20100101 Firefox/64.0",
            Cookie: reslogin.res.headers['set-cookie'], //这里是登陆后得到的cookie,(重点)
        },
        form: {
            authenticationFailureUrl: '/edu3/login.html?error=true',
            defaultTargetUrl: "/edu3/framework/index.html",
            j_username: config.username,
            j_password: config.password,
            fromNet: 'pub'
        }
    };
    let resform = await send(optsform);
    console.log('登陆成功。。。');

    //获取课程列表
    let optsframe = {
        url: 'https://wl.scutde.net/edu3/edu3/framework/index.html',
        method: 'GET',
        headers: {
            'User-Agent': "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:64.0) Gecko/20100101 Firefox/64.0",
            Cookie: reslogin.res.headers['set-cookie']
        }
    };
    let resframe = await send(optsframe);

    //解析课表
    let $ = cheerio.load(resframe.body);
    let frameobj = $("#tab tr td:nth-child(2) a");
    let framearr = [];
    frameobj.each(function (index, element) {
        //     { name: '网上学习指南',
        //     courseId: 'FBECB1BCE79E171EE030007F01001614',
        //     planCourseId: 'ff808081645dce9501646305efe158d1' }
        framearr.push({
            name: element.children[0].data,
            courseId: element.attribs.onclick.split('\'')[1],
            planCourseId: element.attribs.onclick.split('\'')[3]
        })
    });
    console.log('获取课表成功。。。');

    //输出数字以及代表的课程名臣
    for (let i = 0; i < framearr.length; i++) {
        console.log(i, framearr[i].name)
    }
    let num = await read();

    let tmpobj = framearr[num];

    let optslearn = {
        url: 'https://wl.scutde.net/edu3/edu3/learning/interactive/main.html?planCourseId=' + tmpobj.planCourseId + '&courseId=' + tmpobj.courseId + '&isNeedReExamination=',
        method: 'GET',
        headers: {
            'User-Agent': "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:64.0) Gecko/20100101 Firefox/64.0",
            Cookie: reslogin.res.headers['set-cookie']
        }
    };
    let reslearn = await send(optslearn);
    // console.log(reslearn.body)

    let strlearn = reslearn.body;
    //取var zNodes之后第一对有效的中括号内的内容
    let start = strlearn.indexOf('var zNodes');
    let end = start;
    let left = 0;
    let right = 0;
    for (let i = start; i < strlearn.length; i++) {
        //记录start
        if (strlearn[i] === '[' && left === 0) {
            start = i
        }
        if (strlearn[i] === '[') {
            left++;
        }
        if (strlearn[i] === ']') {
            right++;
        }
        //记录end
        if (left === right && left !== 0) {
            end = i + 1;
            break
        }
    }
    let zhangjie_arr = JSON.parse(strlearn.substring(start, end));

    let idarr = [];

    function foo(arr, filename) {
        for (let i = 0; i < arr.length; i++) {
            let tmpname = '';
            if (filename) {
                tmpname = filename + '/' + arr[i].name
            } else {
                tmpname = arr[i].name
            }
            idarr.push({
                name: tmpname,
                id: arr[i].id.substring(0, arr[i].id.indexOf(','))
            });
            if (arr[i].nodes) {
                foo(arr[i].nodes, tmpname)
            }
        }
    }

    foo(zhangjie_arr, '');
    console.log(idarr);
    console.log('获取章节成功。。。');


    //获取视频网页
    let video_arr = [];
    for (let i = 0; i < idarr.length; i++) {
        let optsshipin = {
            url: 'https://wl.scutde.net/edu3/edu3/learning/interactive/materesource/list.html?syllabusId=' + idarr[i].id,
            method: 'POST',
            headers: {
                'User-Agent': "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:64.0) Gecko/20100101 Firefox/64.0",
                Cookie: reslogin.res.headers['set-cookie']
            }
        };
        let resshipin = await send(optsshipin);
        let $ = cheerio.load(resshipin.body);
        $('a').each(function () {
            let href = $(this).attr('href');
            let href2 = '';
            if ($(this).attr('onclick')) {
                href2 = $(this).attr('onclick').split('\'')[5];
            }
            if (href2.indexOf("wmv") != -1) {
                //去掉重复url
                let flag = true;
                for (let i = 0; i < video_arr.length; i++) {
                    if (video_arr[i].url === href2) {
                        flag = false
                    }
                }
                if (flag) {
                    video_arr.push({
                        name: idarr[i].name,
                        url: href2,
                        prefix: 'wmv'
                    })
                }
            }
            if (href.indexOf("video") != -1) {
                video_arr.push({
                    name: idarr[i].name,
                    url: href,
                    prefix: 'html'
                })
            }
        });
    }

    console.log(video_arr);
    console.log('获取视频网页地址成功');

    let GREEN = "\033[32m";
    let END = "\033[0m";
    console.log();
    //下载
    for (let i = 0; i < video_arr.length; i++) {
        let filepath = '';
        let fileurl = '';
        if (video_arr[i].prefix === 'html') {
            //MP4
            let tmparr = video_arr[i].url.split('/');
            let filename = tmparr[tmparr.length - 1].replace('html', 'mp4');
            filepath = video_arr[i].name + '/' + filename;
            fileurl = video_arr[i].url.substring(0, video_arr[i].url.length - 4) + 'mp4';
            console.log(fileurl)
        }
        if (video_arr[i].prefix === 'wmv') {
            //wmv
            let tmparr = video_arr[i].url.split('/');
            let filename = tmparr[tmparr.length - 1];
            filepath = video_arr[i].name + '/' + filename;
            fileurl = video_arr[i].url;
            console.log(fileurl)
        }
        mkdirsSync(video_arr[i].name);
        if (fs.existsSync(filepath)) {
            console.log(filepath + '  已存在');
            continue
        }
        console.log('视频文件总数：', video_arr.length, '  开始下载第： ', GREEN, i + 1, END, '个');
        await loadvideo(fileurl, filepath)
    }
    console.log('下载完成～～～');
    process.exit(0)
}

download();
